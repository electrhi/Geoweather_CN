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
  select array_agg(worker.user_id order by worker.user_id) as worker_ids
  from (
    select distinct trim(m.user_id) as user_id
    from public.meters m
    where m.user_id is not null
      and trim(m.user_id) <> ''
      and (
        (r.id = 'daejeon-central' and (m.address like '%대전%동구%' or m.address like '%대전%중구%'))
        or (r.id = 'west-daejeon' and m.address like '%대전%서구%')
        or (r.id = 'daedeok-yuseong' and (m.address like '%대전%대덕구%' or m.address like '%대전%유성구%'))
        or (r.id = 'sejong' and m.address like '%세종%')
        or (r.id = 'cheonan' and m.address like '%천안시%')
        or (r.id = 'gongju' and m.address like '%공주시%')
        or (r.id = 'boryeong' and m.address like '%보령시%')
        or (r.id = 'asan' and m.address like '%아산시%')
        or (r.id = 'seosan' and m.address like '%서산시%')
        or (r.id = 'nonsan' and m.address like '%논산시%')
        or (r.id = 'gyeryong' and m.address like '%계룡시%')
        or (r.id = 'dangjin' and m.address like '%당진시%')
        or (r.id = 'geumsan' and m.address like '%금산군%')
        or (r.id = 'buyeo' and m.address like '%부여군%')
        or (r.id = 'seocheon' and m.address like '%서천군%')
        or (r.id = 'cheongyang' and m.address like '%청양군%')
        or (r.id = 'hongseong' and m.address like '%홍성군%')
        or (r.id = 'yesan' and m.address like '%예산군%')
        or (r.id = 'taean' and m.address like '%태안군%')
      )
  ) worker
) workers on true
where r.active = true;
