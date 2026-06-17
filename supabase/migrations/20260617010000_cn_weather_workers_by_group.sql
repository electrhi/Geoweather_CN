drop view if exists public.cn_weather_dashboard;

create view public.cn_weather_dashboard
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
  workers.worker_ids,
  coalesce(array_length(workers.worker_ids, 1), 0) as worker_count,
  rd.temperature_c,
  rd.humidity_pct,
  rd.wind_ms,
  rd.apparent_temp_c,
  rd.heat_level,
  rd.heat_message,
  rd.observed_at,
  rd.updated_at
from public.cn_weather_regions r
left join public.cn_weather_readings rd on rd.region_id = r.id
left join lateral (
  select array_agg(worker.worker_label order by worker.category, worker.user_id) as worker_ids
  from (
    select distinct
      u.id as user_id,
      u.category,
      concat(u.category::text, '조 ', u.id) as worker_label
    from public.users u
    where u.worker_type = '모뎀작업자'
      and u."Group" = (r.sort_order / 10)
      and u.category is not null
      and u.id is not null
      and trim(u.id) <> ''
  ) worker
) workers on true
where r.active = true;
