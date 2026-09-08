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
    const password=String(body?.password||'');
    const assignments=Array.isArray(body?.assignments)?body.assignments:[];
    if(password.length<8) return reply(400,{success:false,error:'Uniform password must be at least 8 characters.'});
    if(!assignments.length) return reply(400,{success:false,error:'No stream assignments were supplied.'});

    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(listError) return reply(500,{success:false,error:`Could not read Auth users: ${listError.message}`});

    const existingByEmail=new Map((list?.users||[]).map(u=>[(u.email||'').toLowerCase(),u]));
    const results:any[]=[];
    let created=0,updated=0,failed=0;

    for(const raw of assignments){
      const section=String(raw.section||'').trim();
      const grade=String(raw.grade||'').trim();
      const stream=String(raw.stream||'').trim();
      const login=normalizeLogin(String(raw.login_name||`${grade.replace(/\D/g,'')}${stream}`));
      if(!section||!grade||!login || (section!=='ECDE'&&!stream)) {
        results.push({login_name:login||'',status:'failed',success:false,error:'Invalid assignment: ECDE may have no stream; Primary/JSS require a stream.'});
        continue;
      }

      const email=`${login}@stgeorges.local`;
      const fullName=`Class Teacher — ${grade} ${stream}`;
      const existing=existingByEmail.get(email);

      if(existing){
        const {error}=await admin.auth.admin.updateUserById(existing.id,{
          password,email,email_confirm:true,user_metadata:{login_name:login,full_name:fullName}
        });
        if(error){ failed++; results.push({login_name:login,status:'failed',success:false,error:`Could not update ${login}: ${error.message}`}); continue; }

        const {error:pe}=await admin.from('profiles').upsert({
          id:existing.id,login_name:login,email,full_name:fullName,role:'teacher',
          section,grade,stream,active:true
        },{onConflict:'id'});
        if(pe){ failed++; results.push({login_name:login,status:'failed',success:false,error:`Could not update profile for ${login}: ${pe.message}`}); continue; }
        updated++;
        results.push({login_name:login,status:'updated'});
      }else{
        const {data:newUser,error}=await admin.auth.admin.createUser({
          email,password,email_confirm:true,user_metadata:{login_name:login,full_name:fullName}
        });
        if(error||!newUser.user){ failed++; results.push({login_name:login,status:'failed',success:false,error:`Could not create ${login}: ${error?.message||'unknown error'}`}); continue; }

        const {error:pe}=await admin.from('profiles').insert({
          id:newUser.user.id,login_name:login,email,full_name:fullName,role:'teacher',
          section,grade,stream,active:true
        });
        if(pe){
          await admin.auth.admin.deleteUser(newUser.user.id);
          failed++; results.push({login_name:login,status:'failed',success:false,error:`Could not create profile for ${login}: ${pe.message}`}); continue;
        }
        existingByEmail.set(email,newUser.user);
        created++;
        results.push({login_name:login,status:'created'});
      }
    }

    return reply(200,{success:failed===0,created,updated,failed,total:created+updated+failed,results});
  }catch(error){
    return reply(500,{success:false,error:error instanceof Error?error.message:String(error)});
  }
});
