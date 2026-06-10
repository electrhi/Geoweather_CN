const SUPABASE_URL = "https://ijuxerhjqmrpjwgsfuqk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXhlcmhqcW1ycGp3Z3NmdXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMTk4ODAsImV4cCI6MjA3Nzc5NTg4MH0.kZD7pMsNR7-jlA44oTVzXfaaDiYaI907C57BpsxM_X8";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const HEAT_LEVELS = new Set(["interest", "caution", "warning", "danger"]);

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const state = {
  rows: [],
  polygons: new Map(),
  labels: new Map(),
  selectedId: null,
  audioReady: false,
  pendingVisitAlarm: false,
};

const tableBody = document.querySelector("#regionTable");
const lastUpdated = document.querySelector("#lastUpdated");
const alertCount = document.querySelector("#alertCount");
const toast = document.querySelector("#toast");
const userIdInput = document.querySelector("#userIdInput");
const refreshButton = document.querySelector("#refreshButton");
const saveUserButton = document.querySelector("#saveUserButton");

const map = L.map("map", {
  zoomControl: false,
  minZoom: 8,
}).setView([36.52, 126.9], 9);

L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const palette = {
  normal: "#2f7d59",
  interest: "#c99a16",
  caution: "#d66a28",
  warning: "#c84034",
  danger: "#7b4fb3",
};

init();

async function init() {
  userIdInput.value = localStorage.getItem("cnWeatherUserId") || "";
  bindEvents();
  await loadDashboard();
  await recordVisit();
  await refreshWeather();
  setInterval(refreshWeather, REFRESH_INTERVAL_MS);
}

function bindEvents() {
  refreshButton.addEventListener("click", async () => {
    await refreshWeather(true);
  });

  saveUserButton.addEventListener("click", () => {
    localStorage.setItem("cnWeatherUserId", userIdInput.value.trim());
    showToast("작업자 정보가 저장됐습니다.");
  });

  window.addEventListener("pointerdown", () => {
    state.audioReady = true;
    if (state.pendingVisitAlarm) {
      state.pendingVisitAlarm = false;
      playAlarm();
    }
  }, { once: true });
}

async function loadDashboard() {
  const { data, error } = await client
    .from("cn_weather_dashboard")
    .select("*")
    .order("sort_order");

  if (error) {
    showToast(`데이터를 불러오지 못했습니다: ${error.message}`);
    return;
  }

  state.rows = data || [];
  renderTable();
  renderMap();
  updateSummary();
  triggerHeatAlarms();
}

async function refreshWeather(forceToast = false) {
  const { data, error } = await client.functions.invoke("cn-weather-refresh", { body: {} });

  if (error) {
    showToast(`기상청 업데이트 실패: ${error.message}`);
    return;
  }

  if (data?.error === "kma_service_key_missing") {
    showToast("Supabase Edge Function에 KMA_SERVICE_KEY를 설정하면 기상청 값이 갱신됩니다.");
  } else if (forceToast) {
    showToast("기상청 체감온도 갱신을 요청했습니다.");
  }

  await loadDashboard();
}

async function recordVisit() {
  const userId = userIdInput.value.trim() || null;
  await client.from("cn_weather_visit_events").insert({
    user_id: userId,
    user_agent: navigator.userAgent,
  });

  await client.from("cn_weather_alert_events").insert({
    alert_type: "visit",
    user_id: userId,
    message: userId ? `${userId} 접속` : "익명 접속",
  });

  notify("접속 알림", userId ? `${userId} 작업자가 접속했습니다.` : "사이트 접속이 감지됐습니다.");
}

function renderTable() {
  tableBody.replaceChildren(...state.rows.map((row) => {
    const tr = document.createElement("tr");
    const assigned = row.user_id || "-";
    tr.dataset.regionId = row.id;
    tr.innerHTML = `
      <td>${escapeHtml(row.display_name)}</td>
      <td><span class="temp level-${row.heat_level || "normal"}">${formatTemp(row.apparent_temp_c)}</span></td>
      <td><button class="assign-button" type="button" title="현재 작업자 배정">${escapeHtml(assigned)}</button></td>
    `;
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
    showToast(`작업자 배정 실패: ${error.message}`);
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

  const bounds = [];

  for (const row of state.rows) {
    const color = palette[row.heat_level] || palette.normal;
    const latLngs = (row.polygon || []).map(([lat, lng]) => [lat, lng]);
    bounds.push(...latLngs);

    const polygon = L.polygon(latLngs, {
      color,
      fillColor: color,
      fillOpacity: 0.34,
      weight: 2,
    }).addTo(map);

    polygon.bindPopup(popupHtml(row));
    polygon.on("click", () => focusRegion(row.id));
    state.polygons.set(row.id, polygon);

    const label = L.marker([row.center_lat, row.center_lng], {
      icon: L.divIcon({
        className: "region-label",
        html: `<div><strong>${escapeHtml(row.display_name)}</strong><span>${formatTemp(row.apparent_temp_c)}</span></div>`,
        iconSize: [96, 48],
        iconAnchor: [48, 24],
      }),
      interactive: true,
    }).addTo(map);

    label.on("click", () => focusRegion(row.id));
    state.labels.set(row.id, label);
  }

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [28, 28] });
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
  return `
    <h2 class="popup-title">${escapeHtml(row.display_name)}</h2>
    <dl class="popup-meta">
      <div>체감온도: <strong>${formatTemp(row.apparent_temp_c)}</strong></div>
      <div>상태: <strong>${escapeHtml(levelLabel(row.heat_level))}</strong></div>
      <div>작업자: <strong>${escapeHtml(row.user_id || "-")}</strong></div>
      <div>관측: <strong>${formatTime(row.observed_at)}</strong></div>
    </dl>
  `;
}

function updateSummary() {
  const updated = state.rows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const alerts = state.rows.filter((row) => HEAT_LEVELS.has(row.heat_level)).length;

  lastUpdated.textContent = updated ? formatTime(updated) : "대기 중";
  alertCount.textContent = String(alerts);
}

function triggerHeatAlarms() {
  const hotRows = state.rows.filter((row) => HEAT_LEVELS.has(row.heat_level));
  if (hotRows.length === 0) return;

  const top = hotRows[0];
  notify("온열질환 기준 도달", `${top.display_name} ${levelLabel(top.heat_level)} ${formatTemp(top.apparent_temp_c)}`);
}

async function notify(title, body) {
  showToast(`${title}: ${body}`);

  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }

  playAlarm();
}

function playAlarm() {
  if (!state.audioReady) {
    state.pendingVisitAlarm = true;
    return;
  }
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.setValueAtTime(660, context.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 4400);
}

function formatTemp(value) {
  return value === null || value === undefined ? "--.-도" : `${Number(value).toFixed(1)}도`;
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
    interest: "관심",
    caution: "주의",
    warning: "경고",
    danger: "위험",
  }[level] || "정상";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
