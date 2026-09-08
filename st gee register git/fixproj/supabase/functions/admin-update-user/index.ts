import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const normalizeLogin=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{status:200,headers:corsHeaders});
  if(req.method!=='POST') return reply(405,{success:false,error:'POST required.'});

  try{
    const url=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key) return reply(500,{success:false,error:'Edge Function is missing Supabase configuration.'});

    const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
    if(!token) return reply(401,{success:false,error:'Admin session required.'});

    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:me,error:meError}=await admin.auth.getUser(token);
    if(meError||!me.user) return reply(401,{success:false,error:'Invalid admin session.'});

    const {data:caller,error:callerError}=await admin.from('profiles').select('role,active').eq('id',me.user.id).maybeSingle();
    if(callerError) return reply(500,{success:false,error:`Could not read admin profile: ${callerError.message}`});
    if(caller?.role!=='admin'||caller.active!==true) return reply(403,{success:false,error:'Admin access required.'});

    const body=await req.json().catch(()=>null);
    if(!body) return reply(400,{success:false,error:'Invalid request body.'});

    const userId=String(body.user_id||'').trim();
    const login=normalizeLogin(String(body.login_name||''));
    const fullName=String(body.full_name||'').trim();
    const suppliedEmail=String(body.email||'').trim().toLowerCase();
    const email=suppliedEmail||`${login}@stgeorges.local`;
    const phone=String(body.phone||'').trim()||null;
    const role=String(body.role||'teacher').trim().toLowerCase();
    const section=body.section?String(body.section).trim():null;
    const grade=body.grade?String(body.grade).trim():null;
    const stream=body.stream?String(body.stream).trim():null;
    const active=body.active!==false;
    const password=String(body.password||'');

    if(!userId||!login||!fullName||!email) return reply(400,{success:false,error:'User ID, login name, full name and email/login are required.'});
    if(!['admin','teacher'].includes(role)) return reply(400,{success:false,error:'Invalid role.'});
    if(role==='teacher'&&(!section||!grade||(section!=='ECDE'&&!stream))) return reply(400,{success:false,error:'A class teacher must have section and class/grade; Primary/JSS teachers must also have a stream.'});
    if(password && password.length<8) return reply(400,{success:false,error:'Password must be at least 8 characters.'});

    const {data:dup}=await admin.from('profiles').select('id').ilike('login_name',login).neq('id',userId).maybeSingle();
    if(dup) return reply(409,{success:false,error:`Login name ${login} is already in use.`});

    const authUpdate:any={
      email,
      email_confirm:true,
      user_metadata:{login_name:login,full_name:fullName}
    };
    if(password) authUpdate.password=password;

    const {error:authError}=await admin.auth.admin.updateUserById(userId,authUpdate);
    if(authError) return reply(400,{success:false,error:`Auth account update failed: ${authError.message}`});

    const {data:updated,error:profileError}=await admin.from('profiles').update({
      login_name:login,
      email,
      full_name:fullName,
      phone,
      role,
      section:role==='teacher'?section:null,
      grade:role==='teacher'?grade:null,
      stream:role==='teacher'?stream:null,
      active
    }).eq('id',userId).select().single();

    if(profileError) return reply(400,{success:false,error:`Profile update failed: ${profileError.message}`});
    return reply(200,{success:true,profile:updated});
  }catch(error){
    return reply(500,{success:false,error:error instanceof Error?error.message:String(error)});
  }
});
