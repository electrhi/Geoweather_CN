# Geoweather_CN

충청남도·대전광역시·세종특별자치시의 **시/군/구 단위 온열질환 관제 웹앱**입니다.

기상청 초단기실황의 기온·습도·풍속을 수집하고, 기상청 여름철 체감온도 산출 방식으로 체감온도를 계산한 뒤 고용노동부 온열질환 대응 기준에 따라 상태를 표시합니다.

## 관제 범위

- 대전광역시: 동구, 중구, 서구, 유성구, 대덕구
- 세종특별자치시: 세종시
- 충청남도: 천안시, 공주시, 보령시, 아산시, 서산시, 논산시, 계룡시, 당진시, 금산군, 부여군, 서천군, 청양군, 홍성군, 예산군, 태안군

지도 경계는 `southkorea/southkorea-maps`의 시군구 TopoJSON을 불러와 표시합니다. 천안시는 동남구와 서북구 경계를 합쳐 하나의 천안시 권역으로 보여줍니다.

## 온열질환 기준

현재 경보 기준은 다음과 같습니다.

- 33℃ 이상: 폭염주의 — 작업시간대 조정 또는 옥외작업 단축
- 35℃ 이상: 폭염경보 — 14~17시 옥외작업 중지
- 38℃ 이상: 폭염중대경보 — 긴급조치 작업 외 옥외작업 중지

알림은 같은 단계에서 반복해서 보내지 않고, **정상→주의, 주의→경보, 경보→중대경보처럼 단계가 상승할 때만** 발송합니다.

## 체감온도

기상청 초단기실황 API에서 다음 항목을 사용합니다.

- `T1H`: 기온
- `REH`: 상대습도
- `WSD`: 풍속(화면/원자료 저장)

체감온도는 기상청 여름철 체감온도 방식에 맞춰 Stull 습구온도 근사식과 기상청 보정식을 사용합니다.

## 주요 파일

- `index.html`: 관제 화면
- `styles.css`: PC/모바일 화면 스타일
- `app.js`: 지도, Supabase 조회, 작업자 배정, Push 구독
- `sw.js`: Web Push 서비스 워커
- `supabase/functions/cn-weather-refresh/index.ts`: 기상청 수집, 체감온도 계산, 단계 판정
- `supabase/functions/cn-weather-push/index.ts`: Push 구독 관리 및 경보 발송
- `supabase/migrations/20261002000000_city_county_heat_alerts.sql`: 대전 5개 구 분리 및 Push 구독 테이블
- `.github/workflows/cn-weather-refresh.yml`: 15분 자동 갱신

## Supabase 배포

기존 Supabase 프로젝트는 `ijuxerhjqmrpjwgsfuqk`입니다.

먼저 마이그레이션을 적용하고 두 Edge Function을 배포합니다.

```bash
supabase db push

supabase functions deploy cn-weather-refresh
supabase functions deploy cn-weather-push
```

### 필요한 Edge Function Secret

기상청 API:

```text
KMA_SERVICE_KEY=공공데이터포털_서비스키
```

Web Push:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:관리자메일주소
```

VAPID 키는 예를 들어 `web-push generate-vapid-keys`로 생성할 수 있습니다.

## 15분 자동 갱신

GitHub Actions의 `.github/workflows/cn-weather-refresh.yml`이 15분마다 `cn-weather-refresh` Edge Function을 호출합니다.

Repository Settings → Secrets and variables → Actions에 다음 Secret을 등록해야 합니다.

```text
SUPABASE_ANON_KEY
```

이 값은 현재 웹앱에서 사용하는 Supabase anon key와 동일한 키입니다.

GitHub Actions의 스케줄은 정확히 매 15분 정각을 보장하지는 않지만, 서버 측에서 페이지 접속 여부와 무관하게 반복 호출됩니다. 더 엄격한 실행주기가 필요하면 Supabase Cron/Scheduled Functions로 동일 함수를 15분마다 호출해도 됩니다.

## 휴대폰 Push 알림

HTTPS로 배포된 사이트에서 **알림 받기** 버튼을 누르면 브라우저 Push 구독이 저장됩니다.

지원 대상:

- Android Chrome 계열: 일반 Web Push 지원
- iPhone/iPad: 홈 화면에 추가한 웹앱(PWA) 환경에서 Web Push 사용 권장

사이트가 닫혀 있어도 Push 구독과 서비스 워커가 정상 등록되어 있으면 단계 상승 시 알림을 받을 수 있습니다.

## 주의사항

- 시·군·구별 값은 각 권역의 대표 기상청 격자 관측값입니다. 한 시·군 내부 모든 지점의 미세기후를 의미하지 않습니다.
- 폭염 단계 판단용 체감온도와 현장 실제 체감환경은 작업장 일사, 복사열, 통풍, 작업강도 등에 따라 달라질 수 있습니다.
- 안전조치는 최신 고용노동부 지침과 사업장 위험성평가를 함께 적용해야 합니다.
