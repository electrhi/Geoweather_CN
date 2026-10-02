-- 2026-10-02: 시군구 단위 관제 + 휴대폰 Push

update public.cn_weather_regions
set active = false, updated_at = now()
where id in ('daejeon-central', 'west-daejeon', 'daedeok-yuseong');

insert into public.cn_weather_regions
  (id, display_name, province, source_names, center_lat, center_lng, polygon, kma_nx, kma_ny, sort_order, active)
values
  ('daejeon-dong', '동구', '대전광역시', array['대전광역시 동구'], 36.3504, 127.4549,
   '[[36.43,127.40],[36.43,127.54],[36.27,127.54],[36.27,127.40]]', 68, 100, 10, true),
  ('daejeon-jung', '중구', '대전광역시', array['대전광역시 중구'], 36.3250, 127.4215,
   '[[36.38,127.36],[36.38,127.47],[36.25,127.47],[36.25,127.36]]', 68, 100, 20, true),
  ('daejeon-seo', '서구', '대전광역시', array['대전광역시 서구'], 36.3553, 127.3836,
   '[[36.43,127.30],[36.43,127.45],[36.27,127.45],[36.27,127.30]]', 67, 100, 30, true),
  ('daejeon-yuseong', '유성구', '대전광역시', array['대전광역시 유성구'], 36.3622, 127.3561,
   '[[36.50,127.25],[36.50,127.43],[36.30,127.43],[36.30,127.25]]', 67, 101, 40, true),
  ('daejeon-daedeok', '대덕구', '대전광역시', array['대전광역시 대덕구'], 36.3467, 127.4156,
   '[[36.46,127.36],[36.46,127.48],[36.32,127.48],[36.32,127.36]]', 68, 101, 50, true)
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

update public.cn_weather_regions set sort_order = 60, province = '세종특별자치시' where id = 'sejong';
update public.cn_weather_regions set sort_order = sort_order + 20, province = '충청남도'
where province = '충남' and active = true;

insert into public.cn_weather_assignments (region_id)
select id from public.cn_weather_regions where active = true
on conflict (region_id) do nothing;

insert into public.cn_weather_readings
  (region_id, temperature_c, humidity_pct, wind_ms, apparent_temp_c, heat_level, heat_message, observed_at, source, raw)
select id, null, null, null, null, 'normal', '기상청 업데이트 대기', null, 'kma', '{}'::jsonb
from public.cn_weather_regions
where active = true
on conflict (region_id) do nothing;

create table if not exists public.cn_weather_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cn_weather_push_subscriptions enable row level security;
