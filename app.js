const SUPABASE_URL = "https://ijuxerhjqmrpjwgsfuqk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXhlcmhqcW1ycGp3Z3NmdXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMTk4ODAsImV4cCI6MjA3Nzc5NTg4MH0.kZD7pMsNR7-jlA44oTVzXfaaDiYaI907C57BpsxM_X8";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const HEAT_LEVELS = new Set(["interest", "caution", "warning", "danger"]);

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const state = {
  rows: [],
  selectedId: null,
  audioReady: false,
  pendingVisitAlarm: false,
};

const tableBody = document.querySelector("#regionTable");
const lastUpdated = document.querySelector("#lastUpdated");
const alertCount = document.querySelector("#alertCount");
const toast = document.querySelector("#toast");
const refreshButton = document.querySelector("#refreshButton");
const infographic = document.querySelector("#map");

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 720;

const REGION_SHAPES = {
  dangjin: { label: [270, 118], tile: [270, 118, 176, 104] },
  asan: { label: [464, 118], tile: [464, 118, 176, 104] },
  cheonan: { label: [658, 118], tile: [658, 118, 176, 104] },
  taean: { label: [172, 248], tile: [172, 248, 176, 104] },
  seosan: { label: [366, 248], tile: [366, 248, 176, 104] },
  yesan: { label: [560, 248], tile: [560, 248, 176, 104] },
  sejong: { label: [754, 248], tile: [754, 248, 176, 104] },
  hongseong: { label: [270, 378], tile: [270, 378, 176, 104] },
  gongju: { label: [464, 378], tile: [464, 378, 176, 104] },
  "daedeok-yuseong": { label: [658, 378], tile: [658, 378, 176, 104], compact: true },
  boryeong: { label: [172, 508], tile: [172, 508, 176, 104] },
  cheongyang: { label: [366, 508], tile: [366, 508, 176, 104] },
  "west-daejeon": { label: [560, 508], tile: [560, 508, 176, 104] },
  "daejeon-central": { label: [754, 508], tile: [754, 508, 176, 104], compact: true },
  seocheon: { label: [172, 638], tile: [172, 638, 176, 104] },
  buyeo: { label: [366, 638], tile: [366, 638, 176, 104] },
  nonsan: { label: [560, 638], tile: [560, 638, 176, 104] },
  gyeryong: { label: [754, 638], tile: [754, 638, 176, 104] },
  geumsan: { label: [894, 638], tile: [894, 638, 148, 104] },
};

const levelCopy = {
  normal: "정상",
  interest: "관심",
  caution: "주의",
  warning: "경고",
  danger: "위험",
};

init();

async function init() {
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
  renderInfographic();
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
  const visitorId = getVisitorId();
  const { error } = await client.functions.invoke("cn-login-alert", {
    body: {
      visitor_id: visitorId,
      user_agent: navigator.userAgent,
    },
  });

  if (!error) return;

  await client.from("cn_weather_visit_events").insert({
    user_id: visitorId,
    user_agent: navigator.userAgent,
  });

  await client.from("cn_weather_alert_events").insert({
    alert_type: "visit",
    user_id: visitorId,
    message: "사이트 접속",
  });
}

function getVisitorId() {
  const storageKey = "cn_weather_visitor_id";
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(storageKey, id);
  return id;
}

function renderTable() {
  tableBody.replaceChildren(...state.rows.map((row) => {
    const tr = document.createElement("tr");
    tr.dataset.regionId = row.id;
    tr.innerHTML = `
      <td>
        <strong class="region-name">${escapeHtml(row.display_name)}</strong>
        <span class="region-province">${escapeHtml(row.province)}</span>
      </td>
      <td><span class="temp level-${row.heat_level || "normal"}">${formatRegionTemp(row)}</span></td>
      <td>${workerListHtml(row.worker_ids, row.worker_count)}</td>
    `;
    tr.addEventListener("click", () => focusRegion(row.id));
    return tr;
  }));
}

function renderInfographic() {
  const hottest = [...state.rows]
    .filter((row) => displayTempValue(row) !== null)
    .sort((a, b) => Number(displayTempValue(b)) - Number(displayTempValue(a)))[0];
  const activeAlerts = state.rows.filter((row) => HEAT_LEVELS.has(row.heat_level)).length;
  const workerTotal = state.rows.reduce((sum, row) => sum + Number(row.worker_count || 0), 0);
  const hasWeatherData = state.rows.some((row) => displayTempValue(row) !== null);

  infographic.innerHTML = `
    <header class="board-header">
      <div>
        <p class="eyebrow">KMA APPARENT TEMPERATURE</p>
        <h2>대전·세종·충남 체감온도 현황</h2>
        <p class="board-subtitle">기상청 초단기실황 기반 · 온열질환 기준 감시 · 모뎀작업자 배치</p>
      </div>
      <div class="map-summary">
        <span>최고 ${hottest ? `${escapeHtml(hottest.display_name)} ${formatRegionTemp(hottest)}` : "기상청 대기"}</span>
        <span>온열 ${activeAlerts}</span>
        <span>모뎀 ${workerTotal}명</span>
      </div>
    </header>
    <div class="map-graphic">
      ${mapSvgHtml(state.rows)}
    </div>
    ${hasWeatherData ? "" : `<div class="weather-empty">KMA_SERVICE_KEY 설정 후 첫 갱신이 완료되면 현재 온도와 체감온도가 표시됩니다.</div>`}
    <div class="board-legend">
      ${Object.entries(levelCopy).map(([level, label]) => `<span><i class="legend-dot level-${level}"></i>${label}</span>`).join("")}
    </div>
  `;

  infographic.querySelectorAll(".map-region").forEach((node) => {
    node.addEventListener("click", () => focusRegion(node.dataset.regionId));
  });
}

function mapSvgHtml(rows) {
  return `
    <svg class="infographic-map" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="충남권 권역별 체감온도 지도">
      <defs>
        <filter id="regionShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="9" flood-color="#011025" flood-opacity="0.32" />
        </filter>
        <linearGradient id="broadcastStage" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0d2b5c" />
          <stop offset="56%" stop-color="#103f83" />
          <stop offset="100%" stop-color="#06172f" />
        </linearGradient>
      </defs>
      <rect class="map-backplate" x="44" y="42" width="912" height="636" rx="34" />
      <path class="broadcast-line" d="M80 184 H922 M80 314 H922 M80 444 H922 M80 574 H922 M230 78 V668 M424 78 V668 M618 78 V668 M812 78 V668" />
      <path class="broadcast-outline" d="M75 64 H925 L956 95 V626 L925 657 H75 L44 626 V95 Z" />
      ${rows.map(regionPathHtml).join("")}
      ${rows.map(regionLabelHtml).join("")}
    </svg>
  `;
}

function regionPathHtml(row) {
  const level = row.heat_level || "normal";
  const shape = REGION_SHAPES[row.id];
  const points = shape?.tile ? tilePoints(...shape.tile) : "";
  const selected = state.selectedId === row.id ? "selected" : "";

  return `
    <polygon
      class="map-region level-fill-${level} ${selected}"
      data-region-id="${escapeHtml(row.id)}"
      points="${points}"
      tabindex="0"
      role="button"
      aria-label="${escapeHtml(row.display_name)} ${formatRegionTemp(row)}"
    />
  `;
}

function regionLabelHtml(row) {
  const shape = REGION_SHAPES[row.id];
  const [x, y] = shape?.label || [500, 360];
  const workerCount = Number(row.worker_count || 0);
  const compact = shape?.compact ? "compact" : "";

  return `
    <g class="map-label ${compact} ${state.selectedId === row.id ? "selected" : ""}" data-region-id="${escapeHtml(row.id)}" transform="translate(${x} ${y})">
      <text class="label-name" y="-12" text-anchor="middle">${escapeHtml(row.display_name)}</text>
      <text class="label-temp" y="10" text-anchor="middle">${formatRegionTemp(row)}</text>
      <text class="label-workers" y="27" text-anchor="middle">모뎀 ${workerCount}명</text>
    </g>
  `;
}

function tilePoints(cx, cy, width, height) {
  const left = cx - width / 2;
  const right = cx + width / 2;
  const top = cy - height / 2;
  const bottom = cy + height / 2;
  const notch = Math.min(width, height) * 0.18;

  return [
    [left + notch, top],
    [right - notch, top],
    [right, cy],
    [right - notch, bottom],
    [left + notch, bottom],
    [left, cy],
  ].map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ");
}

function focusRegion(regionId) {
  state.selectedId = regionId;
  const row = state.rows.find((item) => item.id === regionId);
  if (!row) return;

  renderTable();
  renderInfographic();
  const targetRow = tableBody.querySelector(`[data-region-id="${CSS.escape(regionId)}"]`);
  targetRow?.scrollIntoView({ block: "nearest" });
  showToast(`${row.display_name}: ${formatRegionTemp(row)} / 모뎀 ${row.worker_count || 0}명`);
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
  notify("온열질환 기준 도달", `${top.display_name} ${levelLabel(top.heat_level)} ${formatRegionTemp(top)}`);
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

function workerListHtml(workerIds = [], workerCount = 0) {
  if (!workerIds || workerIds.length === 0) {
    return `<span class="empty-workers">-</span>`;
  }

  return `
    <div class="worker-stack" aria-label="작업자 ${Number(workerCount || workerIds.length)}명">
      ${workerIds.map((worker) => `<span>${escapeHtml(worker)}</span>`).join("")}
    </div>
  `;
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

function formatRegionTemp(row) {
  const value = displayTempValue(row);
  if (value === null) return "갱신대기";

  return HEAT_LEVELS.has(row.heat_level) ? `체감 ${formatTemp(value)}` : `현재 ${formatTemp(value)}`;
}

function displayTempValue(row) {
  if (HEAT_LEVELS.has(row.heat_level)) {
    return apparentTemp(row);
  }

  if (row.temperature_c !== null && row.temperature_c !== undefined) {
    return Number(row.temperature_c);
  }

  return apparentTemp(row);
}

function apparentTemp(row) {
  if (row.apparent_temp_c !== null && row.apparent_temp_c !== undefined) {
    return Number(row.apparent_temp_c);
  }

  if (row.temperature_c === null || row.temperature_c === undefined) return null;
  if (row.humidity_pct === null || row.humidity_pct === undefined) return null;
  if (row.wind_ms === null || row.wind_ms === undefined) return null;

  const temp = Number(row.temperature_c);
  const humidity = Number(row.humidity_pct);
  const wind = Number(row.wind_ms);
  const vaporPressure = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  return Math.round((temp + 0.33 * vaporPressure - 0.7 * wind - 4.0) * 10) / 10;
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
  return levelCopy[level] || "정상";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
