# Geoweather_CN

대전, 세종, 충남의 작업 권역별 체감온도를 지도와 표로 보여주는 정적 웹앱입니다. Supabase 프로젝트 `ijuxerhjqmrpjwgsfuqk`와 연결되어 있습니다.

## 기능

- 대전 동구/중구는 `대전직할`, 서구는 `서대전`, 대덕구/유성구는 `대덕유성`으로 묶습니다.
- 세종과 충남은 시/군 단위로 표시합니다.
- 실제 지도 타일 대신 권역 면과 상대 위치를 살린 상업용 인포그래픽 지도로 표시합니다.
- 왼쪽 표에는 지명, 체감온도, `meters` 데이터에서 자동 집계한 작업자 목록을 표시합니다.
- Supabase Edge Function이 기상청 초단기실황 값을 가져와 30분마다 갱신 요청을 받습니다.
- 온열질환 기준 단계에 도달하거나 사이트 접속이 발생하면 브라우저 알림과 소리 알람을 보냅니다.
- GitHub Actions 예약 실행으로 개인 컴퓨터가 꺼져 있어도 기상청 값을 확인합니다.
- 온열질환 기준 알림은 지역별로 하루 최초 1회만 생성합니다.

## 파일

- `index.html`: 앱 진입점
- `styles.css`: 화면 스타일
- `app.js`: 지도, Supabase, 알림 로직
- `supabase/migrations/20260610000000_cn_weather_schema.sql`: 테이블, 뷰, RLS, 권역 초기 데이터
- `supabase/migrations/20260610001000_cn_weather_security_tightening.sql`: RLS 정책과 view 보안 옵션 보강
- `supabase/migrations/20260610002000_cn_weather_daily_alert_key.sql`: 하루 1회 알림 중복 방지 키
- `supabase/migrations/20260610003000_cn_weather_workers_from_meters.sql`: `meters.address`와 `meters.user_id` 기반 권역별 작업자 집계 view
- `supabase/functions/cn-weather-refresh/index.ts`: 기상청 업데이트 Edge Function
- `.github/workflows/pages.yml`: GitHub Pages 무료 정적 사이트 배포
- `.github/workflows/daily-weather-alert.yml`: 기상청 체감온도 예약 확인

## Supabase 설정

마이그레이션은 다음 테이블과 뷰를 만듭니다.

- `cn_weather_regions`
- `cn_weather_readings`
- `cn_weather_assignments`
- `cn_weather_visit_events`
- `cn_weather_alert_events`
- `cn_weather_dashboard`

Edge Function에는 기상청 공공데이터포털 단기예보 조회서비스 키를 `KMA_SERVICE_KEY` 이름으로 등록해야 실제 관측값이 갱신됩니다.

사이트가 닫혀 있어도 외부 알림을 받고 싶다면 Supabase Edge Function secret에 `NTFY_TOPIC_URL`을 등록합니다. 예시는 `https://ntfy.sh/your-private-topic-name` 형식입니다. 이 경우 온열질환 기준에 도달한 지역은 한국시간 기준 하루 최초 1회만 알림을 보냅니다.

GitHub Pages는 저장소 Settings > Pages에서 Source를 `GitHub Actions`로 설정하면 무료로 배포됩니다.

## 실행

이 앱은 정적 파일이므로 GitHub Pages로 배포하면 별도 서버나 개인 컴퓨터 실행 없이 사용할 수 있습니다. CDN을 사용하므로 인터넷 연결이 필요합니다.
