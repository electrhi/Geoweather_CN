drop view if exists public.cn_weather_dashboard;

create view public.cn_weather_dashboard
with (security_invoker = true) as
with latest_worker_meter as (
  select distinct on (trim(m.user_id))
    trim(m.user_id) as user_id,
    m.address,
    m.updated_at,
    m.id
  from public.meters m
  join public.users u on u.id = trim(m.user_id)
  where m.user_id is not null
    and trim(m.user_id) <> ''
    and u.worker_type = '모뎀작업자'
  order by trim(m.user_id), m.updated_at desc nulls last, m.id desc
)
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
      concat(coalesce(u.category::text || '조 ', ''), u.id) as worker_label
    from latest_worker_meter lwm
    join public.users u on u.id = lwm.user_id
    where (
      (r.id = 'daejeon-central' and (lwm.address like '%대전%동구%' or lwm.address like '%대전%중구%'))
      or (r.id = 'west-daejeon' and lwm.address like '%대전%서구%')
      or (r.id = 'daedeok-yuseong' and (lwm.address like '%대전%대덕구%' or lwm.address like '%대전%유성구%'))
      or (r.id = 'sejong' and lwm.address like '%세종%')
      or (r.id = 'cheonan' and lwm.address like '%천안%')
      or (r.id = 'gongju' and lwm.address like '%공주%')
      or (r.id = 'boryeong' and lwm.address like '%보령%')
      or (r.id = 'asan' and lwm.address like '%아산%')
      or (r.id = 'seosan' and lwm.address like '%서산%')
      or (r.id = 'nonsan' and lwm.address like '%논산%')
      or (r.id = 'gyeryong' and lwm.address like '%계룡%')
      or (r.id = 'dangjin' and lwm.address like '%당진%')
      or (r.id = 'geumsan' and lwm.address like '%금산%')
      or (r.id = 'buyeo' and lwm.address like '%부여%')
      or (r.id = 'seocheon' and lwm.address like '%서천%')
      or (r.id = 'cheongyang' and lwm.address like '%청양%')
      or (r.id = 'hongseong' and lwm.address like '%홍성%')
      or (r.id = 'yesan' and lwm.address like '%예산%')
      or (r.id = 'taean' and lwm.address like '%태안%')
    )
  ) worker
) workers on true
where r.active = true;
