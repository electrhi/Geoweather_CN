create or replace view public.cn_weather_dashboard
with (security_invoker = true) as
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

drop policy if exists "cn assignments editable" on public.cn_weather_assignments;
create policy "cn assignments editable"
on public.cn_weather_assignments for all
to anon, authenticated
using (region_id is not null)
with check (
  region_id is not null
  and (user_id is null or length(user_id) <= 128)
);

drop policy if exists "cn visit insertable" on public.cn_weather_visit_events;
create policy "cn visit insertable"
on public.cn_weather_visit_events for insert
to anon, authenticated
with check (
  created_at <= now() + interval '5 minutes'
  and (user_id is null or length(user_id) <= 128)
);

drop policy if exists "cn alerts insertable" on public.cn_weather_alert_events;
create policy "cn alerts insertable"
on public.cn_weather_alert_events for insert
to anon, authenticated
with check (
  alert_type in ('heat', 'visit')
  and length(message) between 1 and 300
  and (user_id is null or length(user_id) <= 128)
);

