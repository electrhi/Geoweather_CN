# Geoweather_CN

대전, 세종, 충남의 작업 권역별 체감온도를 지도와 표로 보여주는 정적 웹앱입니다. Supabase 프로젝트 `ijuxerhjqmrpjwgsfuqk`와 연결되어 있습니다.

## 기능

- 대전 동구/중구는 `대전직할`, 서구는 `서대전`, 대덕구/유성구는 `대덕유성`으로 묶습니다.
- 세종과 충남은 시/군 단위로 표시합니다.
- 지도에는 권역명과 기상청 기준 체감온도를 함께 표시합니다.
- 왼쪽 표에는 지명, 체감온도, 작업자 `user_id`를 표시합니다.
- Supabase Edge Function이 기상청 초단기실황 값을 가져와 30분마다 갱신 요청을 받습니다.
- 온열질환 기준 단계에 도달하거나 사이트 접속이 발생하면 브라우저 알림과 소리 알람을 보냅니다.

## 파일

- `index.html`: 앱 진입점
- `styles.css`: 화면 스타일
- `app.js`: 지도, Supabase, 알림 로직
- `supabase/migrations/20260610000000_cn_weather_schema.sql`: 테이블, 뷰, RLS, 권역 초기 데이터
- `supabase/migrations/20260610001000_cn_weather_security_tightening.sql`: RLS 정책과 view 보안 옵션 보강
- `supabase/functions/cn-weather-refresh/index.ts`: 기상청 업데이트 Edge Function

## Supabase 설정

마이그레이션은 다음 테이블과 뷰를 만듭니다.

- `cn_weather_regions`
- `cn_weather_readings`
- `cn_weather_assignments`
- `cn_weather_visit_events`
- `cn_weather_alert_events`
- `cn_weather_dashboard`

Edge Function에는 기상청 공공데이터포털 단기예보 조회서비스 키를 `KMA_SERVICE_KEY` 이름으로 등록해야 실제 관측값이 갱신됩니다.

## 실행

이 앱은 정적 파일이므로 `index.html`을 브라우저로 열거나 로컬 정적 서버로 실행하면 됩니다. 현재 작업 환경에서는 `http://localhost:8080`에서 확인할 수 있습니다. CDN을 사용하므로 인터넷 연결이 필요합니다.
