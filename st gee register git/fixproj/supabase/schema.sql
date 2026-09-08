-- ST. GEORGE'S DIGITAL REGISTER — CLEAN FINAL DATABASE
-- WARNING: This rebuild removes the existing application tables and their data:
-- profiles, classes, learners, attendance and academic_years.
-- Supabase Auth users are NOT deleted.
-- Run this file once in Supabase SQL Editor, then deploy the four Edge Functions.

create extension if not exists pgcrypto;

drop function if exists public.advance_academic_year(integer);
drop function if exists public.teacher_can_access(text,text);
drop function if exists public.is_admin();
drop function if exists public.current_role();
drop table if exists public.attendance cascade;
drop table if exists public.learners cascade;
drop table if exists public.classes cascade;
drop table if exists public.academic_years cascade;
drop table if exists public.profiles cascade;

-- Staff profile. id is required to link the profile to Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_name text not null,
  email text,
  full_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'teacher' check (role in ('admin','teacher')),
  section text check (section is null or section in ('ECDE','Primary','JSS')),
  grade text,
  stream text,
  active boolean not null default true,
  constraint profiles_login_name_unique unique (login_name)
);

-- Class/stream catalogue. id is the system key; no timestamps are needed.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('ECDE','Primary','JSS')),
  grade text not null,
  stream text not null default '',
  class_teacher uuid references public.profiles(id) on delete set null,
  constraint classes_assignment_unique unique (section,grade,stream)
);

-- Learner register. These are the only learner fields required by the app/import.
create table public.learners (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null,
  kemis_no text,
  full_name text not null,
  gender text not null check (gender in ('Male','Female')),
  residence text not null check (residence in ('Boarder','Day Scholar')),
  section text not null check (section in ('ECDE','Primary','JSS')),
  grade text not null,
  stream text,
  active boolean not null default true,
  constraint learners_admission_unique unique (admission_no),
  constraint learners_kemis_unique unique (kemis_no)
);

-- One attendance record per learner per date.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('Present','Absent')),
  marked_by uuid references public.profiles(id) on delete set null,
  constraint attendance_learner_date_unique unique (learner_id,attendance_date)
);

create table public.academic_years (
  year integer primary key,
  active boolean not null default false
);

create index learners_class_lookup on public.learners(section,grade,stream) where active=true;
create index attendance_date_lookup on public.attendance(attendance_date);

-- =========================
-- SECURITY HELPERS
-- =========================
create or replace function public.current_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and active=true limit 1 $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true) $$;

create or replace function public.teacher_can_access(learner_grade text, learner_stream text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='teacher' and p.active=true
      and p.grade=learner_grade
      and coalesce(p.stream,'')=coalesce(learner_stream,'')
  )
$$;

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.learners enable row level security;
alter table public.attendance enable row level security;
alter table public.academic_years enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated using (id=auth.uid() or public.is_admin());

create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated
using (id=auth.uid() or public.is_admin())
with check (id=auth.uid() or public.is_admin());

create policy "profiles_insert_admin" on public.profiles
for insert to authenticated with check (public.is_admin());


create policy "learners_select_by_role" on public.learners
for select to authenticated
using (public.is_admin() or public.teacher_can_access(grade,stream));

create policy "learners_insert_by_role" on public.learners
for insert to authenticated
with check (public.is_admin() or public.teacher_can_access(grade,stream));

create policy "learners_update_by_role" on public.learners
for update to authenticated
using (public.is_admin() or public.teacher_can_access(grade,stream))
with check (public.is_admin() or public.teacher_can_access(grade,stream));

create policy "learners_delete_by_role" on public.learners
for delete to authenticated
using (public.is_admin() or public.teacher_can_access(grade,stream));

create policy "attendance_select_by_role" on public.attendance
for select to authenticated
using (
  public.is_admin() or exists(
    select 1 from public.learners l
    where l.id=attendance.learner_id and public.teacher_can_access(l.grade,l.stream)
  )
);

create policy "attendance_insert_by_role" on public.attendance
for insert to authenticated
with check (
  public.is_admin() or exists(
    select 1 from public.learners l
    where l.id=attendance.learner_id and public.teacher_can_access(l.grade,l.stream)
  )
);

create policy "attendance_update_by_role" on public.attendance
for update to authenticated
using (
  public.is_admin() or exists(
    select 1 from public.learners l
    where l.id=attendance.learner_id and public.teacher_can_access(l.grade,l.stream)
  )
)
with check (
  public.is_admin() or exists(
    select 1 from public.learners l
    where l.id=attendance.learner_id and public.teacher_can_access(l.grade,l.stream)
  )
);

create policy "attendance_delete_by_role" on public.attendance
for delete to authenticated
using (public.is_admin());

create policy "classes_select_authenticated" on public.classes
for select to authenticated
using (public.is_admin() or public.current_role()='teacher');

create policy "classes_admin_manage" on public.classes
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "academic_year_admin_manage" on public.academic_years
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Default class/stream catalogue.
insert into public.classes(section,grade,stream)
select 'Primary',g,s from unnest(array['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6']) g
cross join unnest(array['PE','PK','PL','PR','PS']) s;

insert into public.classes(section,grade,stream)
select 'JSS',g,s from unnest(array['Grade 7','Grade 8','Grade 9']) g
cross join unnest(array['JE','JK','JL','JR','JS']) s;

insert into public.classes(section,grade,stream)
select 'ECDE',g,'' from unnest(array['PP1','PP2']) g;

-- Re-create an admin profile automatically if the known Auth account already exists.
-- The Auth password is unchanged; this only restores its application profile.
do $$
declare u record;
begin
  select id,email into u from auth.users where lower(email)='admin@stgeorges.local' limit 1;
  if u.id is not null then
    insert into public.profiles(id,login_name,email,full_name,role,active)
    values(u.id,'admin@stgeorges.local',u.email,'Administrator','admin',true)
    on conflict(id) do update set login_name=excluded.login_name,email=excluded.email,role='admin',active=true;
  end if;
end $$;

create or replace function public.advance_academic_year(target_year integer)
returns json language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.academic_years set active=false;
  insert into public.academic_years(year,active) values(target_year,true)
  on conflict(year) do update set active=true;
  return json_build_object('success',true,'year',target_year);
end;
$$;

notify pgrst,'reload schema';

-- Profile pictures
insert into storage.buckets(id,name,public) values ('avatars','avatars',true)
on conflict(id) do update set public=true;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_insert" on storage.objects;
drop policy if exists "avatars_own_update" on storage.objects;
drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id='avatars');
create policy "avatars_own_insert" on storage.objects for insert to authenticated
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "avatars_own_update" on storage.objects for update to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "avatars_own_delete" on storage.objects for delete to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
