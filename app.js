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
const MAP_PADDING = 58;

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
  await client.from("cn_weather_visit_events").insert({
    user_id: null,
    user_agent: navigator.userAgent,
  });

  await client.from("cn_weather_alert_events").insert({
    alert_type: "visit",
    user_id: null,
    message: "사이트 접속",
  });
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
      <td><span class="temp level-${row.heat_level || "normal"}">${formatTemp(row.apparent_temp_c)}</span></td>
      <td>${workerListHtml(row.worker_ids, row.worker_count)}</td>
    `;
    tr.addEventListener("click", () => focusRegion(row.id));
    return tr;
  }));
}

function renderInfographic() {
  const hottest = [...state.rows]
    .filter((row) => row.apparent_temp_c !== null && row.apparent_temp_c !== undefined)
    .sort((a, b) => Number(b.apparent_temp_c) - Number(a.apparent_temp_c))[0];
  const activeAlerts = state.rows.filter((row) => HEAT_LEVELS.has(row.heat_level)).length;
  const workerTotal = state.rows.reduce((sum, row) => sum + Number(row.worker_count || 0), 0);

  infographic.innerHTML = `
    <div class="board-grid" aria-hidden="true"></div>
    <div class="board-river" aria-hidden="true"></div>
    <header class="board-header">
      <div>
        <p class="eyebrow">COMMERCIAL HEAT MONITOR</p>
        <h2>충남권 체감온도 보드</h2>
      </div>
      <div class="board-kpis">
        <div><span>최고 체감</span><strong>${hottest ? `${escapeHtml(hottest.display_name)} ${formatTemp(hottest.apparent_temp_c)}` : "--.-도"}</strong></div>
        <div><span>온열 단계</span><strong>${activeAlerts}</strong></div>
        <div><span>작업자</span><strong>${workerTotal}</strong></div>
      </div>
    </header>
    <div class="map-graphic">
      ${mapSvgHtml(state.rows)}
    </div>
    <div class="board-legend">
      ${Object.entries(levelCopy).map(([level, label]) => `<span><i class="legend-dot level-${level}"></i>${label}</span>`).join("")}
    </div>
  `;

  infographic.querySelectorAll(".map-region").forEach((node) => {
    node.addEventListener("click", () => focusRegion(node.dataset.regionId));
  });
}

function mapSvgHtml(rows) {
  const projection = createProjection(rows);

  return `
    <svg class="infographic-map" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="충남권 권역별 체감온도 지도">
      <defs>
        <filter id="regionShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#1f2b35" flood-opacity="0.16" />
        </filter>
        <linearGradient id="seaGradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dff3f4" />
          <stop offset="100%" stop-color="#ecf2fb" />
        </linearGradient>
      </defs>
      <path class="map-backplate" d="M154 144 C260 48 410 77 508 118 C636 172 762 126 854 225 C945 323 897 514 779 595 C647 688 498 624 388 651 C248 684 93 591 78 449 C64 322 55 235 154 144 Z" />
      <path class="map-coastline" d="M118 198 C223 110 319 120 435 159 C574 206 683 137 811 241 C892 307 884 481 767 559 C626 653 532 565 381 606 C253 641 142 563 123 448 C103 329 29 274 118 198 Z" />
      ${rows.map((row) => regionPathHtml(row, projection)).join("")}
      ${rows.map((row) => regionLabelHtml(row, projection)).join("")}
    </svg>
  `;
}

function createProjection(rows) {
  const points = rows.flatMap((row) => row.polygon || []);
  const lats = points.map(([lat]) => Number(lat));
  const lngs = points.map(([, lng]) => Number(lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const width = SVG_WIDTH - MAP_PADDING * 2;
  const height = SVG_HEIGHT - MAP_PADDING * 2;

  return ([lat, lng]) => {
    const x = MAP_PADDING + ((Number(lng) - minLng) / (maxLng - minLng)) * width;
    const y = MAP_PADDING + ((maxLat - Number(lat)) / (maxLat - minLat)) * height;
    return [Math.round(x), Math.round(y)];
  };
}

function regionPathHtml(row, projection) {
  const level = row.heat_level || "normal";
  const points = (row.polygon || []).map((point) => projection(point).join(",")).join(" ");
  const selected = state.selectedId === row.id ? "selected" : "";

  return `
    <polygon
      class="map-region level-fill-${level} ${selected}"
      data-region-id="${escapeHtml(row.id)}"
      points="${points}"
      tabindex="0"
      role="button"
      aria-label="${escapeHtml(row.display_name)} ${formatTemp(row.apparent_temp_c)}"
    />
  `;
}

function regionLabelHtml(row, projection) {
  const [x, y] = projection([row.center_lat, row.center_lng]);
  const workerCount = Number(row.worker_count || 0);

  return `
    <g class="map-label ${state.selectedId === row.id ? "selected" : ""}" data-region-id="${escapeHtml(row.id)}" transform="translate(${x} ${y})">
      <rect x="-54" y="-31" width="108" height="62" rx="8"></rect>
      <text class="label-name" y="-8" text-anchor="middle">${escapeHtml(row.display_name)}</text>
      <text class="label-temp" y="12" text-anchor="middle">${formatTemp(row.apparent_temp_c)}</text>
      <text class="label-workers" y="27" text-anchor="middle">작업자 ${workerCount}명</text>
    </g>
  `;
}

function focusRegion(regionId) {
  state.selectedId = regionId;
  const row = state.rows.find((item) => item.id === regionId);
  if (!row) return;

  renderTable();
  renderInfographic();
  const targetRow = tableBody.querySelector(`[data-region-id="${CSS.escape(regionId)}"]`);
  targetRow?.scrollIntoView({ block: "nearest" });
  showToast(`${row.display_name}: ${formatTemp(row.apparent_temp_c)} / 작업자 ${row.worker_count || 0}명`);
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
