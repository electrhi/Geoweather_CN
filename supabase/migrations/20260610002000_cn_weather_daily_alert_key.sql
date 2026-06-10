alter table public.cn_weather_alert_events
add column if not exists alert_key text;

create unique index if not exists cn_weather_alert_events_alert_key_uidx
on public.cn_weather_alert_events(alert_key)
where alert_key is not null;

