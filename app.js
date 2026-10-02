const SUPABASE_URL = "https://ijuxerhjqmrpjwgsfuqk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXhlcmhqcW1ycGp3Z3NmdXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMTk4ODAsImV4cCI6MjA3Nzc5NTg4MH0.kZD7pMsNR7-jlA44oTVzXfaaDiYaI907C57BpsxM_X8";
const DASHBOARD_REFRESH_MS = 2 * 60 * 1000;
const GEO_TOPO_URL = "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json";

const REGION_BOUNDARY_CODES = {
  "daejeon-dong": ["25010"],
  "daejeon-jung": ["25020"],
  "daejeon-seo": ["25030"],
  "daejeon-yuseong": ["25040"],
  "daejeon-daedeok": ["25050"],
  sejong: ["29010"],
  cheonan: ["34011", "34012"],
  gongju: ["34020"],
  boryeong: ["34030"],
  asan: ["34040"],
  seosan: ["34050"],
  nonsan: ["34060"],
  gyeryong: ["34070"],
  dangjin: ["34080"],
  geumsan: ["34310"],
  buyeo: ["34330"],
  seocheon: ["34340"],
  cheongyang: ["34350"],
  hongseong: ["34360"],
  yesan: ["34370"],
  taean: ["34380"],
};

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const state = {
  rows: [],
  polygons: new Map(),
  labels: new Map(),
  boundaryFeatures: new Map(),
  selectedId: null,
};

const tableBody = document.querySelector("#regionTable");
const lastUpdated = document.querySelector("#lastUpdated");
const alertCount = document.querySelector("#alertCount");
const toast = document.querySelector("#toast");
const userIdInput = document.querySelector("#userIdInput");
const refreshButton = document.querySelector("#refreshButton");
const saveUserButton = document.querySelector("#saveUserButton");
const pushButton = document.querySelector("#pushButton");
const pushStatus = document.querySelector("#pushStatus");

const map = L.map("map", {
  zoomControl: false,
  minZoom: 7,
}).setView([36.55, 126.95], 9);

L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const palette = {
  normal: "#2f7d59",
  interest: "#c99a16",
  caution: "#d68a28",
  warning: "#c84034",
  danger: "#7b263a",
};

init();

async function init() {
  userIdInput.value = localStorage.getItem("cnWeatherUserId") || "";
  bindEvents();
  await loadAdministrativeBoundaries();
  await loadDashboard();
  await recordVisit();
  await updatePushUi();
  setInterval(loadDashboard, DASHBOARD_REFRESH_MS);
}

function bindEvents() {
  refreshButton.addEventListener("click", async () => {
    await loadDashboard();
    showToast("최신 관제 데이터를 다시 불러왔습니다.");
  });

  saveUserButton.addEventListener("click", () => {
    localStorage.setItem("cnWeatherUserId", userIdInput.value.trim());
    showToast("작업자 정보가 저장됐습니다.");
  });

  pushButton.addEventListener("click", togglePushSubscription);
}

async function loadAdministrativeBoundaries() {
  try {
    const response = await fetch(GEO_TOPO_URL);
    if (!response.ok) throw new Error("행정경계 다운로드 실패");
    const topology = await response.json();
    const object = topology.objects.skorea_municipalities_2018_geo;
    const featureCollection = window.topojson.feature(topology, object);
    const byCode = new Map(
      featureCollection.features.map((feature) => [String(feature.properties.code), feature]),
    );

    for (const [regionId, codes] of Object.entries(REGION_BOUNDARY_CODES)) {
      const features = codes.map((code) => byCode.get(code)).filter(Boolean);
      if (features.length) state.boundaryFeatures.set(regionId, features);
    }
  } catch (error) {
    console.warn(error);
    showToast("행정경계 데이터를 불러오지 못해 임시 경계를 사용합니다.");
  }
}

async function loadDashboard() {
  const { data, error } = await client
    .from("cn_weather_dashboard")
    .select("*")
    .order("sort_order");

  if (error) {
    showToast("데이터를 불러오지 못했습니다: " + error.message);
    return;
  }

  state.rows = data || [];
  renderTable();
  renderMap();
  updateSummary();
}

async function recordVisit() {
  const userId = userIdInput.value.trim() || null;
  await client.from("cn_weather_visit_events").insert({
    user_id: userId,
    user_agent: navigator.userAgent,
  });
}

function renderTable() {
  tableBody.replaceChildren(...state.rows.map((row) => {
    const tr = document.createElement("tr");
    const assigned = row.user_id || "-";
    tr.dataset.regionId = row.id;
    tr.innerHTML =
      "<td><span class=\"region-name\">" + escapeHtml(row.display_name) + "</span><small>" +
      escapeHtml(row.province || "") + "</small></td>" +
      "<td><span class=\"temp level-" + escapeHtml(row.heat_level || "normal") + "\">" +
      formatTemp(row.apparent_temp_c) + "</span></td>" +
      "<td><button class=\"assign-button\" type=\"button\" title=\"현재 작업자 배정\">" +
      escapeHtml(assigned) + "</button></td>";

    tr.addEventListener("click", () => focusRegion(row.id));
    tr.querySelector(".assign-button").addEventListener("click", async (event) => {
      event.stopPropagation();
      await assignCurrentUser(row.id);
    });
    return tr;
  }));
}

async function assignCurrentUser(regionId) {
  const userId = userIdInput.value.trim();
  if (!userId) {
    showToast("작업자 user_id를 먼저 입력해 주세요.");
    userIdInput.focus();
    return;
  }

  localStorage.setItem("cnWeatherUserId", userId);
  const { error } = await client
    .from("cn_weather_assignments")
    .upsert({ region_id: regionId, user_id: userId, updated_at: new Date().toISOString() });

  if (error) {
    showToast("작업자 배정 실패: " + error.message);
    return;
  }

  showToast("작업자가 배정됐습니다.");
  await loadDashboard();
}

function renderMap() {
  for (const layer of state.polygons.values()) layer.remove();
  for (const marker of state.labels.values()) marker.remove();
  state.polygons.clear();
  state.labels.clear();

  const group = L.featureGroup();

  for (const row of state.rows) {
    const color = palette[row.heat_level] || palette.normal;
    const boundaryFeatures = state.boundaryFeatures.get(row.id);
    let polygon;

    if (boundaryFeatures?.length) {
      polygon = L.geoJSON(
        { type: "FeatureCollection", features: boundaryFeatures },
        {
          style: {
            color,
            fillColor: color,
            fillOpacity: 0.36,
            weight: 2,
          },
        },
      ).addTo(map);
    } else {
      const latLngs = (row.polygon || []).map(([lat, lng]) => [lat, lng]);
      polygon = L.polygon(latLngs, {
        color,
        fillColor: color,
        fillOpacity: 0.36,
        weight: 2,
      }).addTo(map);
    }

    polygon.bindPopup(popupHtml(row));
    polygon.on("click", () => focusRegion(row.id));
    state.polygons.set(row.id, polygon);
    group.addLayer(polygon);

    const label = L.marker([row.center_lat, row.center_lng], {
      icon: L.divIcon({
        className: "region-label",
        html:
          "<div class=\"level-border-" + escapeHtml(row.heat_level || "normal") + "\">" +
          "<strong>" + escapeHtml(row.display_name) + "</strong>" +
          "<span>" + formatTemp(row.apparent_temp_c) + "</span></div>",
        iconSize: [104, 50],
        iconAnchor: [52, 25],
      }),
      interactive: true,
    }).addTo(map);

    label.on("click", () => focusRegion(row.id));
    state.labels.set(row.id, label);
  }

  if (group.getLayers().length) {
    map.fitBounds(group.getBounds(), { padding: [26, 26] });
  }
}

function focusRegion(regionId) {
  const row = state.rows.find((item) => item.id === regionId);
  const polygon = state.polygons.get(regionId);
  if (!row || !polygon) return;

  state.selectedId = regionId;
  map.fitBounds(polygon.getBounds(), { maxZoom: 11, padding: [42, 42] });
  polygon.openPopup();
}

function popupHtml(row) {
  return (
    "<h2 class=\"popup-title\">" + escapeHtml(row.display_name) + "</h2>" +
    "<dl class=\"popup-meta\">" +
    "<div>체감온도: <strong>" + formatTemp(row.apparent_temp_c) + "</strong></div>" +
    "<div>단계: <strong>" + escapeHtml(levelLabel(row.heat_level)) + "</strong></div>" +
    "<div>조치: <strong>" + escapeHtml(row.heat_message || actionLabel(row.heat_level)) + "</strong></div>" +
    "<div>작업자: <strong>" + escapeHtml(row.user_id || "-") + "</strong></div>" +
    "<div>관측: <strong>" + formatTime(row.observed_at) + "</strong></div>" +
    "</dl>"
  );
}

function updateSummary() {
  const updated = state.rows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const alerts = state.rows.filter((row) => severity(row.heat_level) > 0).length;

  lastUpdated.textContent = updated ? formatTime(updated) : "대기 중";
  alertCount.textContent = String(alerts);
}

async function updatePushUi() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    pushButton.disabled = true;
    pushStatus.textContent = "이 브라우저는 푸시 알림을 지원하지 않습니다.";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    const subscription = await registration.pushManager.getSubscription();
    pushButton.textContent = subscription ? "알림 끄기" : "알림 받기";
    pushStatus.textContent = subscription
      ? "온열 단계 상승 시 휴대폰으로 알림을 받습니다."
      : "33℃ 이상 단계 상승 시 휴대폰 알림을 받을 수 있습니다.";
  } catch (error) {
    console.warn(error);
    pushStatus.textContent = "알림 기능을 초기화하지 못했습니다.";
  }
}

async function togglePushSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();

    if (current) {
      await client.functions.invoke("cn-weather-push", {
        body: { action: "unsubscribe", endpoint: current.endpoint },
      });
      await current.unsubscribe();
      showToast("온열질환 푸시 알림을 해제했습니다.");
      await updatePushUi();
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("휴대폰/브라우저에서 알림 권한을 허용해 주세요.");
      return;
    }

    const { data, error } = await client.functions.invoke("cn-weather-push", {
      body: { action: "public-key" },
    });
    if (error || !data?.publicKey) {
      throw new Error(error?.message || "VAPID 공개키를 가져오지 못했습니다.");
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });

    const json = subscription.toJSON();
    const { error: saveError } = await client.functions.invoke("cn-weather-push", {
      body: {
        action: "subscribe",
        endpoint: json.endpoint,
        keys: json.keys,
        user_id: userIdInput.value.trim() || null,
      },
    });
    if (saveError) throw saveError;

    showToast("온열질환 푸시 알림이 등록됐습니다.");
    await updatePushUi();
  } catch (error) {
    console.error(error);
    showToast("알림 설정 실패: " + (error?.message || "알 수 없는 오류"));
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function severity(level) {
  return { normal: 0, interest: 0, caution: 1, warning: 2, danger: 3 }[level] ?? 0;
}

function formatTemp(value) {
  return value === null || value === undefined ? "--.-℃" : Number(value).toFixed(1) + "℃";
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function levelLabel(level) {
  return {
    normal: "정상",
    interest: "정상",
    caution: "폭염주의",
    warning: "폭염경보",
    danger: "폭염중대경보",
  }[level] || "정상";
}

function actionLabel(level) {
  return {
    normal: "기본 폭염예방수칙 준수",
    caution: "작업시간대 조정 또는 옥외작업 단축",
    warning: "14~17시 옥외작업 중지",
    danger: "긴급조치 작업 외 옥외작업 중지",
  }[level] || "기본 폭염예방수칙 준수";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 4400);
}
