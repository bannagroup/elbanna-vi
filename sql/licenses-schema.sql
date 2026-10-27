-- ============================================================================
-- تطبيق التراخيص (قاعدة Supabase المستقلة) — الجداول + الصلاحيات + مخزن الملفات
-- بيتشغّل مرة واحدة على المشروع الجديد (SQL Editor أو عن طريق Claude).
-- الأمان: الدخول مقصور على المستخدمين الموجودين في جدول app_staff (حتى لو حد سجّل حساب جديد مايشوفش حاجة).
-- ============================================================================

-- المستخدمين المسموح لهم (بيتضافوا يدويًا بعد إنشاء حساب الدخول)
create table if not exists public.app_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);
alter table public.app_staff enable row level security; -- من غير policies: مفيش وصول من التطبيق

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.app_staff where user_id = auth.uid()) $$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- السائقين (بيتضافوا يدويًا)
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  national_id text,
  notes text,
  created_at timestamptz not null default now()
);

-- السيارات
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  car_number text not null unique,
  car_type text,
  brand text,
  chassis_number text,
  motor_number text,
  owner_company text,
  license_supervisor text,
  license_end_date date,
  car_driver_id uuid references public.drivers(id) on delete set null,
  insured_driver_id uuid references public.drivers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cars_car_driver_idx on public.cars (car_driver_id);
create index if not exists cars_insured_driver_idx on public.cars (insured_driver_id);

-- الملفات (ملف واحد لكل نوع مستند: الرفع الجديد بيستبدل القديم)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('car', 'driver')),
  owner_id uuid not null,
  doc_type text not null check (doc_type in ('car_license', 'insurance_letter', 'driver_id_card', 'driver_license')),
  file_path text not null,
  file_name text,
  content_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  unique (owner_type, owner_id, doc_type),
  check (
    (owner_type = 'car' and doc_type in ('car_license', 'insurance_letter')) or
    (owner_type = 'driver' and doc_type in ('driver_id_card', 'driver_license'))
  )
);

alter table public.drivers enable row level security;
alter table public.cars enable row level security;
alter table public.documents enable row level security;

revoke all on public.drivers, public.cars, public.documents from anon;

drop policy if exists staff_all on public.drivers;
create policy staff_all on public.drivers for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists staff_all on public.cars;
create policy staff_all on public.cars for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists staff_all on public.documents;
create policy staff_all on public.documents for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- مخزن الملفات (خاص — التنزيل بروابط مؤقتة)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs', 'docs', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

drop policy if exists docs_staff_all on storage.objects;
create policy docs_staff_all on storage.objects for all to authenticated
  using (bucket_id = 'docs' and public.is_staff())
  with check (bucket_id = 'docs' and public.is_staff());
