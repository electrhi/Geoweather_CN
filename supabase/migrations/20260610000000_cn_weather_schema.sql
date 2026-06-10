create table if not exists public.cn_weather_regions (
  id text primary key,
  display_name text not null,
  province text not null,
  source_names text[] not null default '{}',
  center_lat double precision not null,
  center_lng double precision not null,
  polygon jsonb not null,
  kma_nx integer not null,
  kma_ny integer not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cn_weather_readings (
  region_id text primary key references public.cn_weather_regions(id) on delete cascade,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  wind_ms numeric(5,2),
  apparent_temp_c numeric(5,2),
  heat_level text not null default 'normal'
    check (heat_level in ('normal', 'interest', 'caution', 'warning', 'danger')),
  heat_message text not null default '정상',
  observed_at timestamptz,
  source text not null default 'kma',
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cn_weather_assignments (
  region_id text primary key references public.cn_weather_regions(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cn_weather_visit_events (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.cn_weather_alert_events (
  id uuid primary key default gen_random_uuid(),
  region_id text references public.cn_weather_regions(id) on delete set null,
  alert_type text not null check (alert_type in ('heat', 'visit')),
  heat_level text check (heat_level in ('interest', 'caution', 'warning', 'danger')),
  apparent_temp_c numeric(5,2),
  user_id text,
  message text not null,
  created_at timestamptz not null default now(),
  acknowledged boolean not null default false
);

create or replace view public.cn_weather_dashboard as
select
  r.id,
  r.display_name,
  r.province,
  r.source_names,
  r.center_lat,
  r.center_lng,
  r.polygon,
  r.kma_nx,
  r.kma_ny,
  r.sort_order,
  a.user_id,
  rd.temperature_c,
  rd.humidity_pct,
  rd.wind_ms,
  rd.apparent_temp_c,
  rd.heat_level,
  rd.heat_message,
  rd.observed_at,
  rd.updated_at
from public.cn_weather_regions r
left join public.cn_weather_assignments a on a.region_id = r.id
left join public.cn_weather_readings rd on rd.region_id = r.id
where r.active = true;

alter table public.cn_weather_regions enable row level security;
alter table public.cn_weather_readings enable row level security;
alter table public.cn_weather_assignments enable row level security;
alter table public.cn_weather_visit_events enable row level security;
alter table public.cn_weather_alert_events enable row level security;

drop policy if exists "cn regions readable" on public.cn_weather_regions;
create policy "cn regions readable"
on public.cn_weather_regions for select
to anon, authenticated
using (true);

drop policy if exists "cn readings readable" on public.cn_weather_readings;
create policy "cn readings readable"
on public.cn_weather_readings for select
to anon, authenticated
using (true);

drop policy if exists "cn assignments readable" on public.cn_weather_assignments;
create policy "cn assignments readable"
on public.cn_weather_assignments for select
to anon, authenticated
using (true);

drop policy if exists "cn assignments editable" on public.cn_weather_assignments;
create policy "cn assignments editable"
on public.cn_weather_assignments for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "cn visit insertable" on public.cn_weather_visit_events;
create policy "cn visit insertable"
on public.cn_weather_visit_events for insert
to anon, authenticated
with check (true);

drop policy if exists "cn alerts readable" on public.cn_weather_alert_events;
create policy "cn alerts readable"
on public.cn_weather_alert_events for select
to anon, authenticated
using (true);

drop policy if exists "cn alerts insertable" on public.cn_weather_alert_events;
create policy "cn alerts insertable"
on public.cn_weather_alert_events for insert
to anon, authenticated
with check (true);

insert into public.cn_weather_regions
  (id, display_name, province, source_names, center_lat, center_lng, polygon, kma_nx, kma_ny, sort_order)
values
  ('daejeon-central', '대전직할', '대전', array['대전 동구', '대전 중구'], 36.3270, 127.4360, '[[36.370,127.390],[36.370,127.485],[36.285,127.485],[36.285,127.390]]', 68, 100, 10),
  ('west-daejeon', '서대전', '대전', array['대전 서구'], 36.3540, 127.3840, '[[36.405,127.325],[36.405,127.430],[36.305,127.430],[36.305,127.325]]', 67, 100, 20),
  ('daedeok-yuseong', '대덕유성', '대전', array['대전 대덕구', '대전 유성구'], 36.3920, 127.3680, '[[36.455,127.290],[36.455,127.455],[36.345,127.455],[36.345,127.290]]', 67, 101, 30),
  ('sejong', '세종', '세종', array['세종특별자치시'], 36.4800, 127.2890, '[[36.660,127.140],[36.660,127.430],[36.310,127.430],[36.310,127.140]]', 66, 103, 40),
  ('cheonan', '천안시', '충남', array['천안시'], 36.8150, 127.1140, '[[36.960,126.980],[36.960,127.260],[36.680,127.260],[36.680,126.980]]', 63, 110, 50),
  ('gongju', '공주시', '충남', array['공주시'], 36.4460, 127.1190, '[[36.610,126.940],[36.610,127.310],[36.280,127.310],[36.280,126.940]]', 63, 102, 60),
  ('boryeong', '보령시', '충남', array['보령시'], 36.3330, 126.6120, '[[36.510,126.420],[36.510,126.780],[36.150,126.780],[36.150,126.420]]', 54, 100, 70),
  ('asan', '아산시', '충남', array['아산시'], 36.7890, 127.0010, '[[36.920,126.820],[36.920,127.170],[36.650,127.170],[36.650,126.820]]', 60, 110, 80),
  ('seosan', '서산시', '충남', array['서산시'], 36.7850, 126.4500, '[[36.930,126.250],[36.930,126.650],[36.630,126.650],[36.630,126.250]]', 51, 110, 90),
  ('nonsan', '논산시', '충남', array['논산시'], 36.1870, 127.0990, '[[36.330,126.930],[36.330,127.270],[36.040,127.270],[36.040,126.930]]', 62, 97, 100),
  ('gyeryong', '계룡시', '충남', array['계룡시'], 36.2740, 127.2490, '[[36.330,127.180],[36.330,127.320],[36.220,127.320],[36.220,127.180]]', 65, 99, 110),
  ('dangjin', '당진시', '충남', array['당진시'], 36.8890, 126.6450, '[[37.030,126.430],[37.030,126.850],[36.730,126.850],[36.730,126.430]]', 54, 112, 120),
  ('geumsan', '금산군', '충남', array['금산군'], 36.1080, 127.4880, '[[36.250,127.310],[36.250,127.670],[35.960,127.670],[35.960,127.310]]', 69, 95, 130),
  ('buyeo', '부여군', '충남', array['부여군'], 36.2750, 126.9100, '[[36.440,126.720],[36.440,127.080],[36.100,127.080],[36.100,126.720]]', 59, 99, 140),
  ('seocheon', '서천군', '충남', array['서천군'], 36.0800, 126.6910, '[[36.230,126.500],[36.230,126.870],[35.940,126.870],[35.940,126.500]]', 55, 94, 150),
  ('cheongyang', '청양군', '충남', array['청양군'], 36.4590, 126.8020, '[[36.610,126.610],[36.610,126.980],[36.310,126.980],[36.310,126.610]]', 57, 103, 160),
  ('hongseong', '홍성군', '충남', array['홍성군'], 36.6010, 126.6610, '[[36.730,126.500],[36.730,126.840],[36.460,126.840],[36.460,126.500]]', 55, 106, 170),
  ('yesan', '예산군', '충남', array['예산군'], 36.6820, 126.8490, '[[36.830,126.670],[36.830,127.030],[36.530,127.030],[36.530,126.670]]', 58, 107, 180),
  ('taean', '태안군', '충남', array['태안군'], 36.7450, 126.2980, '[[36.930,126.070],[36.930,126.500],[36.540,126.500],[36.540,126.070]]', 48, 109, 190)
on conflict (id) do update set
  display_name = excluded.display_name,
  province = excluded.province,
  source_names = excluded.source_names,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  polygon = excluded.polygon,
  kma_nx = excluded.kma_nx,
  kma_ny = excluded.kma_ny,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

insert into public.cn_weather_assignments (region_id)
select id from public.cn_weather_regions
on conflict (region_id) do nothing;

insert into public.cn_weather_readings
  (region_id, temperature_c, humidity_pct, wind_ms, apparent_temp_c, heat_level, heat_message, observed_at, source, raw)
select id, null, null, null, null, 'normal', '기상청 업데이트 대기', null, 'kma', '{}'::jsonb
from public.cn_weather_regions
on conflict (region_id) do nothing;

