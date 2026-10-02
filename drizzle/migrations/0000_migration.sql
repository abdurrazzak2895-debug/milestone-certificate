
create type public.app_role as enum ('admin','staff');
create type public.exam_result as enum ('PENDING','PASS','FAIL','ABSENT','CANCELLED');

create table public.profiles (id uuid primary key, full_name text, email text, created_at timestamptz not null default now());
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null, role public.app_role not null, unique(user_id, role));
create table public.ttc_centers (id uuid primary key default gen_random_uuid(), name text not null unique, district text, created_at timestamptz not null default now());
create table public.occupations (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now());
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  passport_no text unique,
  registration_no text unique,
  mobile text,
  occupation_id uuid references public.occupations(id) on delete set null,
  ttc_id uuid references public.ttc_centers(id) on delete set null,
  district text,
  passport_expiry date,
  date_of_birth date,
  photo_url text,
  notes text,
  needs_follow_up boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  exam_date date not null,
  exam_time time,
  ttc_id uuid references public.ttc_centers(id) on delete set null,
  occupation_id uuid references public.occupations(id) on delete set null,
  exam_type text not null default 'নিয়মিত',
  result public.exam_result not null default 'PENDING',
  result_date date,
  score numeric,
  remarks text,
  created_at timestamptz not null default now(),
  unique(candidate_id, exam_date, occupation_id)
);
create table public.results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  result public.exam_result not null,
  score numeric,
  result_date date,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  title text not null,
  due_date date not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.settings (key text primary key, value text);

do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','ttc_centers','occupations','candidates','exams','results','reminders','settings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;

do $$ declare t text; begin
  foreach t in array array['ttc_centers','occupations','candidates','exams','results','reminders','settings'] loop
    execute format('create policy "staff all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid()=id);
create policy "roles read" on public.user_roles for select to authenticated using (true);
create policy "roles admin manage" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id,'admin');
  else
    insert into public.user_roles(user_id, role) values (new.id,'staff');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.log_result() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.result <> 'PENDING' and (tg_op='INSERT' or new.result is distinct from old.result or new.score is distinct from old.score) then
    insert into public.results(exam_id, candidate_id, result, score, result_date, source)
    values (new.id, new.candidate_id, new.result, new.score, coalesce(new.result_date, current_date), 'manual');
  end if;
  return new;
end $$;
create trigger exams_log_result after insert or update on public.exams for each row execute function public.log_result();

insert into public.occupations(name) values ('ড্রাইভিং'),('ইলেকট্রিশিয়ান'),('ওয়েল্ডিং'),('প্লাম্বিং'),('কেয়ারগিভার');
insert into public.ttc_centers(name, district) values ('খুলনা টিটিসি','খুলনা'),('বগুড়া টিটিসি','বগুড়া'),('ঢাকা টিটিসি','ঢাকা'),('চট্টগ্রাম টিটিসি','চট্টগ্রাম');
insert into public.settings(key,value) values ('org_name','পরীক্ষার্থী ব্যবস্থাপনা'),('result_api_url','');

insert into public.candidates(name, passport_no, registration_no, mobile, occupation_id, ttc_id, district, passport_expiry, date_of_birth, notes, needs_follow_up)
select v.name, v.pp, v.reg, v.mob, (select id from public.occupations where name=v.occ), (select id from public.ttc_centers where name=v.ttc), v.dist, v.exp::date, v.dob::date, v.notes, v.fu
from (values
 ('মোঃ রফিকুল ইসলাম','A01234567','REG-2026-001','01711000001','ড্রাইভিং','খুলনা টিটিসি','খুলনা','2030-05-10','1995-02-14','ডেমো রেকর্ড', false),
 ('আব্দুল করিম','A01234568','REG-2026-002','01711000002','ইলেকট্রিশিয়ান','ঢাকা টিটিসি','ঢাকা','2029-11-01','1993-07-21','ডেমো রেকর্ড', true),
 ('সুমাইয়া আক্তার','A01234569','REG-2026-003','01711000003','কেয়ারগিভার','ঢাকা টিটিসি','গাজীপুর','2031-01-15','1998-03-03','ডেমো রেকর্ড', false),
 ('জাহিদ হাসান','A01234570','REG-2026-004','01711000004','ওয়েল্ডিং','চট্টগ্রাম টিটিসি','চট্টগ্রাম','2028-08-20','1996-12-11','ডেমো রেকর্ড', false),
 ('মাসুদ রানা','A01234571','REG-2026-005','01711000005','ড্রাইভিং','বগুড়া টিটিসি','বগুড়া','2030-02-28','1992-09-09','ডেমো রেকর্ড', true),
 ('শাহীন আলম','A01234572','REG-2026-006','01711000006','প্লাম্বিং','খুলনা টিটিসি','যশোর','2029-06-30','1997-04-18','ডেমো রেকর্ড', false)
) as v(name,pp,reg,mob,occ,ttc,dist,exp,dob,notes,fu);

insert into public.exams(candidate_id, exam_date, exam_time, ttc_id, occupation_id, exam_type, result, result_date, score, remarks)
select (select id from public.candidates where registration_no=v.reg), (current_date + v.d), v.t::time,
  (select id from public.ttc_centers where name=v.ttc), (select id from public.occupations where name=v.occ),
  v.typ, v.res::public.exam_result, case when v.res = 'PENDING' then null else current_date + v.d + 3 end, v.score, v.rem
from (values
 ('REG-2026-001',-23,'10:00','বগুড়া টিটিসি','ড্রাইভিং','নিয়মিত','ABSENT',null::numeric,'অনুপস্থিত'),
 ('REG-2026-001',-13,'10:00','খুলনা টিটিসি','ড্রাইভিং','পুনঃপরীক্ষা','FAIL',42,''),
 ('REG-2026-001',2,'09:30','খুলনা টিটিসি','ড্রাইভিং','পুনঃপরীক্ষা','PENDING',null,''),
 ('REG-2026-002',-40,'11:00','ঢাকা টিটিসি','ইলেকট্রিশিয়ান','নিয়মিত','PASS',78,''),
 ('REG-2026-002',-5,'11:00','ঢাকা টিটিসি','ইলেকট্রিশিয়ান','নিয়মিত','PENDING',null,'রেজাল্ট অপেক্ষমান'),
 ('REG-2026-003',0,'10:30','ঢাকা টিটিসি','কেয়ারগিভার','নিয়মিত','PENDING',null,''),
 ('REG-2026-004',-60,'09:00','চট্টগ্রাম টিটিসি','ওয়েল্ডিং','নিয়মিত','FAIL',35,''),
 ('REG-2026-004',-20,'09:00','চট্টগ্রাম টিটিসি','ওয়েল্ডিং','পুনঃপরীক্ষা','PASS',71,''),
 ('REG-2026-005',1,'14:00','বগুড়া টিটিসি','ড্রাইভিং','নিয়মিত','PENDING',null,''),
 ('REG-2026-005',-90,'14:00','বগুড়া টিটিসি','ড্রাইভিং','নিয়মিত','CANCELLED',null,'বাতিল'),
 ('REG-2026-006',-8,'10:00','খুলনা টিটিসি','প্লাম্বিং','নিয়মিত','PENDING',null,''),
 ('REG-2026-006',5,'10:00','খুলনা টিটিসি','প্লাম্বিং','নিয়মিত','PENDING',null,'')
) as v(reg,d,t,ttc,occ,typ,res,score,rem);

insert into public.reminders(candidate_id, title, due_date)
select id, 'ডকুমেন্ট জমা দেওয়ার জন্য ফোন করুন', current_date + 1 from public.candidates where registration_no='REG-2026-002';

create policy "photos read" on storage.objects for select to authenticated using (bucket_id='candidate-photos');
create policy "photos write" on storage.objects for insert to authenticated with check (bucket_id='candidate-photos');
create policy "photos update" on storage.objects for update to authenticated using (bucket_id='candidate-photos');
