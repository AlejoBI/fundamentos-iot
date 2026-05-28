const API_BASE = `${window.location.origin}/api`;
const NR_BASE = `${window.location.protocol}//${window.location.hostname}:1880`;
const MAX_POINTS = 50;
const ONLINE_WINDOW_MS = 60 * 1000;
const APP_TIME_ZONE = "America/Bogota";
const ANALYSIS_REFRESH_MS = 10000;

const nodesList = document.getElementById("nodesList");
const nodeCount = document.getElementById("nodeCount");
const searchInput = document.getElementById("searchInput");
const zonaFilter = document.getElementById("zonaFilter");
const riskFilter = document.getElementById("riskFilter");
const refreshBtn = document.getElementById("refreshBtn");
const connectionStatus = document.getElementById("connectionStatus");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const detailRisk = document.getElementById("detailRisk");
const detailContext = document.getElementById("detailContext");
const actionStatus = document.getElementById("actionStatus");
const incidentsList = document.getElementById("incidentsList");
const packetLog = document.getElementById("packetLog");
const motivoText = document.getElementById("motivoText");
const tabs = document.querySelectorAll(".tab");
const dashboardPage = document.getElementById("dashboardPage");
const analysisPage = document.getElementById("analysisPage");
const analysisRefresh = document.getElementById("analysisRefresh");
const cleanBtn = document.getElementById("cleanBtn");
const monthlyAnalysisBtn = document.getElementById("monthlyAnalysisBtn");
const cleanStatus = document.getElementById("cleanStatus");
const monthlyAnalysisStatus = document.getElementById("monthlyAnalysisStatus");
const countBrutas = document.getElementById("countBrutas");
const countPendientes = document.getElementById("countPendientes");
const countLimpias = document.getElementById("countLimpias");
const countIncidencias = document.getElementById("countIncidencias");
const countAnalisis = document.getElementById("countAnalisis");
const countEventos = document.getElementById("countEventos");
const ultimaBruta = document.getElementById("ultimaBruta");
const ultimaLimpia = document.getElementById("ultimaLimpia");
const ultimaIncidencia = document.getElementById("ultimaIncidencia");
const ultimaAnalisis = document.getElementById("ultimaAnalisis");
const ultimoEvento = document.getElementById("ultimoEvento");
const qualityBreakdown = document.getElementById("qualityBreakdown");
const riskBreakdown = document.getElementById("riskBreakdown");
const incidentTypeBreakdown = document.getElementById("incidentTypeBreakdown");
const pendingTable = document.getElementById("pendingTable");
const incidenciasTable = document.getElementById("incidenciasTable");
const limpiasTable = document.getElementById("limpiasTable");
const analisisTable = document.getElementById("analisisTable");
const eventosTable = document.getElementById("eventosTable");
const tableTabButtons = document.querySelectorAll("[data-table-tab]");
const tablePanels = document.querySelectorAll("[data-table-panel]");
const tabPendingCount = document.getElementById("tabPendingCount");
const tabIncidenciasCount = document.getElementById("tabIncidenciasCount");
const tabLimpiasCount = document.getElementById("tabLimpiasCount");
const tabAnalisisCount = document.getElementById("tabAnalisisCount");
const tabEventosCount = document.getElementById("tabEventosCount");

const actLed = document.getElementById("actLed");
const actLedValue = document.getElementById("actLedValue");
const actExtractor = document.getElementById("actExtractor");
const actExtractorValue = document.getElementById("actExtractorValue");
const actSirena = document.getElementById("actSirena");
const actSirenaValue = document.getElementById("actSirenaValue");
const actValvula = document.getElementById("actValvula");
const actValvulaValue = document.getElementById("actValvulaValue");
const tempGaugeValue = document.getElementById("tempGaugeValue");
const gasGaugeValue = document.getElementById("gasGaugeValue");

let latestNodes = [];
let selectedId = null;
let lastSeriesTs = null;
let envChart = null;
let gasChart = null;
let tempGauge = null;
let gasGauge = null;
let seriesBuffer = [];
let lastGaugeTemp = null;
let lastGaugeGas = null;
let analysisBarChart = null;
let analysisPieChart = null;
let analysisLineChart = null;

function setConnection(ok, text) {
  const dot = connectionStatus.querySelector(".dot");
  const label = connectionStatus.querySelector("span:last-child");
  dot.style.background = ok ? "#0f766e" : "#f59e0b";
  label.textContent = text;
}

function getRiskColor(risk) {
  if (risk === "EMERGENCIA") return "#e11d48";
  if (risk === "ALERTA") return "#f59e0b";
  if (risk === "INVALIDO") return "#6b7280";
  return "#0f766e";
}

function formatValue(value, suffix) {
  if (value === null || value === undefined) return "--";
  return `${value}${suffix || ""}`;
}

function parseTimestamp(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const ts = Date.parse(hasZone ? normalized : `${normalized}-05:00`);
  return Number.isFinite(ts) ? ts : null;
}

function formatTimestamp(value) {
  const ts = parseTimestamp(value);
  if (!ts) return "--";
  const dt = new Date(ts);
  return dt.toLocaleString("es-CO", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
    hour12: false
  });
}

function formatShortLabel(value) {
  const ts = parseTimestamp(value);
  if (!ts) return "--";
  const dt = new Date(ts);
  return dt.toLocaleString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: APP_TIME_ZONE,
    hour12: false
  });
}

function formatDateShort(value) {
  const ts = parseTimestamp(value);
  if (!ts) return "--";
  const dt = new Date(ts);
  return dt.toLocaleString("es-CO", {
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIME_ZONE
  });
}

function formatNumber(value) {
  if (value === null || value === undefined) return "--";
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("es-CO") : "--";
}

function formatAnalysisValue(key, value) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "object") return JSON.stringify(value);
  if (/fecha|timestamp|_at$/i.test(key)) return formatTimestamp(value);
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value);
}

function getFreshnessTimestamp(node) {
  if (!node) return null;
  return parseTimestamp(node.created_at || node.timestamp_origen);
}

function getFreshnessLabel(node) {
  if (!node) return "--";
  return formatTimestamp(node.created_at || node.timestamp_origen);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
}

function unwrapItems(data) {
  if (Array.isArray(data)) return data;
  if (data && data.items) return data.items;
  return [];
}

function setStatus(container, text) {
  if (!container) return;
  const value = container.querySelector(".value");
  if (value) value.textContent = text;
  else container.textContent = text;
}

function setActionStatus(text) { setStatus(actionStatus, text); }
function setCleanStatus(text) { setStatus(cleanStatus, text); }
function setMonthlyAnalysisStatus(text) { setStatus(monthlyAnalysisStatus, text); }

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const zona = zonaFilter.value;
  const risk = riskFilter.value;
  const filtered = latestNodes.filter((node) => {
    if (zona && node.zona !== zona) return false;
    if (risk && node.estado_riesgo !== risk) return false;
    if (search && !String(node.device_id).toLowerCase().includes(search)) return false;
    return true;
  });
  renderNodes(filtered);
}

function renderNodes(nodes) {
  nodesList.innerHTML = "";
  nodeCount.textContent = nodes.length;
  if (!nodes.length) {
    nodesList.innerHTML = '<div class="meta">Sin nodos con esos filtros.</div>';
    return;
  }
  nodes.forEach((node) => {
    const card = document.createElement("div");
    card.className = "node-card";
    if (node.device_id === selectedId) card.classList.add("active");
    const lastSeenTs = getFreshnessTimestamp(node);
    const isOnline = lastSeenTs ? (Date.now() - lastSeenTs) <= ONLINE_WINDOW_MS : false;
    const statusClass = isOnline ? "online" : "offline";
    const statusText = isOnline ? "EN LINEA" : "SIN DATOS";
    const freshnessLabel = getFreshnessLabel(node);
    const freshnessText = isOnline ? `Ultimo: ${freshnessLabel}` : `Sin datos desde: ${freshnessLabel}`;
    card.innerHTML = `
      <div class="node-title">
        <h3>${node.device_id}</h3>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      <div class="node-meta">
        <span>Zona: ${node.zona}</span>
        <span>Riesgo: ${node.estado_riesgo || "--"}</span>
      </div>
      <div class="node-meta">
        <span>Temp: ${formatValue(node.temperatura_c, "C")}</span>
        <span>MQ135: ${formatValue(node.mq135_aire)}</span>
      </div>
      <div class="node-meta">
        <span>${freshnessText}</span>
      </div>
    `;
    card.style.borderLeft = `4px solid ${getRiskColor(node.estado_riesgo)}`;
    card.addEventListener("click", () => selectNode(node.device_id));
    nodesList.appendChild(card);
  });
}

function buildCharts() {
  const envEl = document.getElementById("envChart");
  const gasEl = document.getElementById("gasChart");
  if (!envEl || !gasEl) return;
  envChart = new Chart(envEl.getContext("2d"), {
    type: "line",
    data: { labels: [], datasets: [{ label: "Temperatura", data: [], borderColor: "#0f766e", backgroundColor: "rgba(15, 118, 110, 0.2)", tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: "#5a4f42" } }, x: { ticks: { color: "#5a4f42" } } }, plugins: { legend: { labels: { color: "#1c1b18" } } } }
  });
  gasChart = new Chart(gasEl.getContext("2d"), {
    type: "line",
    data: { labels: [], datasets: [{ label: "Niveles de Gas", data: [], borderColor: "#4f46e5", backgroundColor: "rgba(79, 70, 229, 0.2)", tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: "#5a4f42" } }, x: { ticks: { color: "#5a4f42" } } }, plugins: { legend: { labels: { color: "#1c1b18" } } } }
  });
}

function updateCharts(series) {
  if (!envChart || !gasChart) buildCharts();
  const trimmed = series.length > MAX_POINTS ? series.slice(-MAX_POINTS) : series;
  const labels = trimmed.map((row) => formatShortLabel(row.timestamp_origen));
  envChart.data.labels = labels;
  envChart.data.datasets[0].data = trimmed.map((row) => row.temperatura_c ?? null);
  envChart.update();
  gasChart.data.labels = labels;
  gasChart.data.datasets[0].data = trimmed.map((row) => row.mq135_aire ?? null);
  gasChart.update();
  if (trimmed.length) lastSeriesTs = parseTimestamp(trimmed[trimmed.length - 1].timestamp_origen);
  else lastSeriesTs = null;
  renderPacketLog(trimmed);
}

function appendLatest(latest) {
  if (!latest || !envChart || !gasChart) return;
  const rawLabel = latest.timestamp_origen;
  if (!rawLabel) return;
  const latestTs = parseTimestamp(rawLabel);
  if (latestTs !== null && lastSeriesTs !== null && latestTs <= lastSeriesTs) return;
  const shortLabel = formatShortLabel(rawLabel);

  seriesBuffer.push(latest);
  if (seriesBuffer.length > MAX_POINTS) seriesBuffer = seriesBuffer.slice(-MAX_POINTS);
  renderPacketLog(seriesBuffer);

  envChart.data.labels.push(shortLabel);
  envChart.data.datasets[0].data.push(latest.temperatura_c ?? null);
  gasChart.data.labels.push(shortLabel);
  gasChart.data.datasets[0].data.push(latest.mq135_aire ?? null);
  if (envChart.data.labels.length > MAX_POINTS) { envChart.data.labels.shift(); envChart.data.datasets.forEach((ds) => ds.data.shift()); }
  if (gasChart.data.labels.length > MAX_POINTS) { gasChart.data.labels.shift(); gasChart.data.datasets.forEach((ds) => ds.data.shift()); }
  try { envChart.update(); } catch (_) {}
  try { gasChart.update(); } catch (_) {}
  if (latestTs !== null) lastSeriesTs = latestTs;
}

function updateDetail(latest) {
  if (!latest) return;
  detailTitle.textContent = `Nodo ${latest.device_id}`;
  const freshnessTs = getFreshnessTimestamp(latest);
  const freshnessLabel = getFreshnessLabel(latest);
  const isOnline = freshnessTs ? (Date.now() - freshnessTs) <= ONLINE_WINDOW_MS : false;
  detailMeta.textContent = isOnline ? `Ultima medicion: ${freshnessLabel} | Registro: ${latest.id || "--"}` : `Sin datos desde: ${freshnessLabel} | Registro: ${latest.id || "--"}`;
  if (detailContext) detailContext.textContent = latest.zona || "-";
  detailRisk.textContent = latest.estado_riesgo || "-";
  detailRisk.style.background = `${getRiskColor(latest.estado_riesgo)}22`;
  detailRisk.style.color = getRiskColor(latest.estado_riesgo);
  if (motivoText) motivoText.textContent = latest.motivo_activacion || "Sin eventos recientes.";
}

// ---- Gauges ----
function buildGauges() {
  const needlePlugin = {
    id: "needle",
    afterDraw(chart) {
      const { ctx, chartArea, data } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data.length) return;
      const last = meta.data[meta.data.length - 1];
      if (!last) return;
      const cx = last.x;
      const cy = last.y;
      const outer = last.outerRadius || (chartArea.right - chartArea.left) * 0.4;
      const inner = last.innerRadius || outer * 0.6;
      const mid = (outer + inner) / 2;
      const total = data.datasets[0].data.reduce((s, v) => s + v, 0);
      let value = 0;
      const chartValue = chart.config._config.options.gaugeValue;
      if (chartValue !== undefined) {
        const maxVal = chart.config._config.options.gaugeMax || 100;
        value = Math.min(chartValue, maxVal) / maxVal;
      }
      const angle = Math.PI * 0.75 + value * Math.PI * 1.5;
      const needleLen = mid * 1.05;
      const nx = cx + Math.cos(angle) * needleLen;
      const ny = cy + Math.sin(angle) * needleLen;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = "#1c1b18";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#1c1b18";
      ctx.fill();
      ctx.restore();
    }
  };

  const gaugeOpts = (maxVal) => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    circumference: 270,
    rotation: 225,
    plugins: { tooltip: { enabled: false }, legend: { display: false } },
    gaugeMax: maxVal,
    gaugeValue: 0
  });

  const tempEl = document.getElementById("tempGauge");
  const gasEl = document.getElementById("gasGauge");
  if (!tempEl || !gasEl) return;
  tempGauge = new Chart(tempEl.getContext("2d"), {
    type: "doughnut",
    data: { datasets: [{ data: [1], backgroundColor: ["#e5e7eb"], borderWidth: 0 }] },
    options: gaugeOpts(50),
    plugins: [needlePlugin]
  });

  gasGauge = new Chart(gasEl.getContext("2d"), {
    type: "doughnut",
    data: { datasets: [{ data: [1], backgroundColor: ["#e5e7eb"], borderWidth: 0 }] },
    options: gaugeOpts(4095),
    plugins: [needlePlugin]
  });
}

function getTempZone(temp) {
  if (temp >= 35) return "#e11d48";
  if (temp >= 28) return "#f59e0b";
  return "#0f766e";
}

function getGasZone(gas) {
  if (gas >= 3600) return "#e11d48";
  return "#0f766e";
}

function updateGauges(latest) {
  if (!tempGauge || !gasGauge) buildGauges();
  if (!latest) return;

  const temp = latest.temperatura_c;
  const gas = latest.mq135_aire;

  if (temp !== null && temp !== undefined) {
    const t = Number(temp);
    if (Number.isFinite(t) && t !== lastGaugeTemp) {
      lastGaugeTemp = t;
      const clamped = Math.max(0, Math.min(50, t));
      tempGauge.options.gaugeValue = t;
      tempGauge.data.datasets[0].data = [clamped, Math.max(0, 50 - clamped)];
      tempGauge.data.datasets[0].backgroundColor = [getTempZone(t), "#e5e7eb"];
      try { tempGauge.update(); } catch (_) {}
      if (tempGaugeValue) tempGaugeValue.textContent = `${t.toFixed(1)}°C`;
    }
  }

  if (gas !== null && gas !== undefined) {
    const g = Number(gas);
    if (Number.isFinite(g) && g !== lastGaugeGas) {
      lastGaugeGas = g;
      const clamped = Math.max(0, Math.min(4095, g));
      gasGauge.options.gaugeValue = g;
      gasGauge.data.datasets[0].data = [clamped, Math.max(0, 4095 - clamped)];
      gasGauge.data.datasets[0].backgroundColor = [getGasZone(g), "#e5e7eb"];
      try { gasGauge.update(); } catch (_) {}
      if (gasGaugeValue) gasGaugeValue.textContent = g.toFixed(0);
    }
  }
}

// ---- Actuator indicators ----
function updateActuators(latest) {
  if (!latest) {
    ["actLedValue","actExtractorValue","actSirenaValue","actValvulaValue"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "--";
    });
    if (actLed) { actLed.style.color = "#ccc"; actLed.textContent = "●"; }
    return;
  }

  const act = latest.actuadores || {};
  const led = (act.led || "").toUpperCase();
  const extractor = (act.extractor || "").toUpperCase();
  const sirena = (act.sirena || "").toUpperCase();
  const valvula = (act.valvula_gas || "").toUpperCase();

  if (actLed) {
    const ledColors = { VERDE: "#0f766e", AMARILLO: "#f59e0b", ROJO: "#e11d48" };
    actLed.style.color = ledColors[led] || "#ccc";
    actLed.textContent = led === "ROJO" ? "●" : led === "AMARILLO" ? "●" : led === "VERDE" ? "●" : "○";
  }
  if (actLedValue) actLedValue.textContent = led || "--";
  if (actExtractorValue) actExtractorValue.textContent = extractor === "ENCENDIDO" ? "ENCENDIDO" : extractor === "APAGADO" ? "APAGADO" : "--";
  if (actSirenaValue) actSirenaValue.textContent = sirena === "ENCENDIDA" ? "ENCENDIDA" : sirena === "APAGADA" ? "APAGADA" : "--";
  if (actValvulaValue) actValvulaValue.textContent = valvula === "ABIERTA" ? "ABIERTA" : valvula === "CERRADA" ? "CERRADA" : "--";

  const riskEls = document.querySelectorAll("[data-actuator]");
  const riskColor = getRiskColor(latest.estado_riesgo);
  riskEls.forEach(el => {
    if (latest.estado_riesgo === "EMERGENCIA") el.style.borderColor = "#e11d48";
    else if (latest.estado_riesgo === "ALERTA") el.style.borderColor = "#f59e0b";
    else el.style.borderColor = "#e7dfd3";
  });
}

async function loadNodesOnce() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/nodes?limit=200`);
      const data = await response.json();
      const items = unwrapItems(data);
      if (items.length || attempt === 2) {
        latestNodes = items;
        applyFilters();
        return;
      }
    } catch (err) { console.error(`loadNodes attempt ${attempt}:`, err); }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
}

async function loadSeries(id) {
  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}/series?recent=1&limit=${MAX_POINTS}`);
    const data = await response.json();
    seriesBuffer = unwrapItems(data);
    updateCharts(seriesBuffer);
  } catch (err) { console.error(err); }
}

async function loadIncidencias(id) {
  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}/incidencias?limit=10`);
    const data = await response.json();
    const items = unwrapItems(data);
    if (!items.length) { incidentsList.textContent = "Sin incidencias."; return; }
    incidentsList.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "incident-item";
      row.textContent = `${item.tipo_incidencia}: ${item.detalle_incidencia}`;
      incidentsList.appendChild(row);
    });
  } catch (err) { console.error(err); }
}

function selectNode(id) {
  selectedId = id;
  lastSeriesTs = null;
  const latest = latestNodes.find((node) => node.device_id === id);
  updateDetail(latest);
  updateGauges(latest);
  updateActuators(latest);
  applyFilters();
  loadSeries(id);
  loadIncidencias(id);
}

async function sendState(state) {
  if (!selectedId) { setActionStatus("Selecciona un nodo primero."); return; }
  const payload = { estado: state };
  setActionStatus("Enviando comando...");
  try {
    const response = await fetch(`${API_BASE}/nodes/${encodeURIComponent(selectedId)}/state`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) { setActionStatus(data.error || "Error enviando comando."); return; }
    const stamp = formatTimestamp(new Date().toISOString());
    setActionStatus(`${state} · ${stamp}`);
  } catch (_err) { setActionStatus("Error enviando comando."); }
}

function renderTable(container, headers, rows, columnCount) {
  if (!container) return;
  container.innerHTML = "";
  if (!rows.length) { container.innerHTML = '<div class="table-empty">Sin datos.</div>'; return; }
  const headerRow = document.createElement("div");
  headerRow.className = `table-row header cols-${columnCount}`;
  headerRow.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
  headers.forEach((title) => { const cell = document.createElement("span"); cell.textContent = title; headerRow.appendChild(cell); });
  container.appendChild(headerRow);
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = `table-row cols-${columnCount}`;
    rowEl.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    row.forEach((cellValue) => { const cell = document.createElement("span"); cell.textContent = cellValue; rowEl.appendChild(cell); });
    container.appendChild(rowEl);
  });
}

function renderBreakdown(container, rows, labelFn) {
  if (!container) return;
  container.innerHTML = "";
  if (!rows.length) { container.textContent = "Sin datos."; return; }
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const label = document.createElement("span"); label.textContent = labelFn(row);
    const value = document.createElement("strong"); value.textContent = formatNumber(row.total);
    item.appendChild(label); item.appendChild(value);
    container.appendChild(item);
  });
}

function renderAnalysisTable(container, items, latestDate) {
  if (!container) return;
  container.className = "table analysis-table-container";
  container.innerHTML = "";
  if (!items.length) { container.innerHTML = '<div class="table-empty">Sin datos.</div>'; return; }
  const columns = Object.keys(items[0]);
  const scroller = document.createElement("div"); scroller.className = "analysis-table-scroll";
  const table = document.createElement("table"); table.className = "analysis-full-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach((column) => { const cell = document.createElement("th"); cell.textContent = column; headerRow.appendChild(cell); });
  thead.appendChild(headerRow);
  const tbody = document.createElement("tbody");
  items.forEach((item) => {
    const row = document.createElement("tr");
    if (latestDate && item.fecha_generacion && item.fecha_generacion === latestDate) {
      row.classList.add("latest-analysis");
    }
    columns.forEach((column) => {
      const value = item[column];
      const cell = document.createElement("td");
      if (value && typeof value === "object") cell.className = "json-cell";
      cell.textContent = formatAnalysisValue(column, value);
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  table.appendChild(thead); table.appendChild(tbody);
  scroller.appendChild(table); container.appendChild(scroller);
}

function renderPacketLog(series) {
  if (!packetLog) return;
  const rows = (series || []).map((item) => [
    formatTimestamp(item.timestamp_origen), formatValue(item.temperatura_c, "C"),
    formatValue(item.mq135_aire), item.estado_riesgo || "--", item.zona || "--"
  ]);
  renderTable(packetLog, ["Fecha", "Temp", "MQ135", "Riesgo", "Zona"], rows, 5);
}

function switchTablePanel(target) {
  tableTabButtons.forEach((button) => {
    const isActive = button.dataset.tableTab === target;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  tablePanels.forEach((panel) => {
    const isActive = panel.dataset.tablePanel === target;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

// ---- Analysis charts ----
function buildAnalysisCharts() {
  const barCtx = document.getElementById("analysisBarChart");
  const pieCtx = document.getElementById("analysisPieChart");
  const lineCtx = document.getElementById("analysisLineChart");

  if (barCtx) {
    const ctx = barCtx.getContext("2d");
    analysisBarChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: "Temp promedio (°C)", data: [], backgroundColor: "#0f766e", borderRadius: 6, yAxisID: "yTemp" },
          { label: "MQ135 promedio", data: [], backgroundColor: "#4f46e5", borderRadius: 6, yAxisID: "yGas" }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          yTemp: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "Temp (°C)", color: "#0f766e" }, ticks: { color: "#0f766e" } },
          yGas: { type: "linear", position: "right", beginAtZero: true, title: { display: true, text: "MQ135", color: "#4f46e5" }, grid: { drawOnChartArea: false }, ticks: { color: "#4f46e5" } },
          x: { ticks: { color: "#5a4f42" } }
        },
        plugins: {
          legend: { labels: { color: "#1c1b18" } },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || "";
                const val = context.parsed.y;
                if (context.dataset.yAxisID === "yTemp") return label + ": " + val.toFixed(1) + " °C";
                if (context.dataset.yAxisID === "yGas") return label + ": " + val.toFixed(0) + " ppm";
                return label + ": " + val;
              }
            }
          }
        }
      }
    });
  }

  if (pieCtx) {
    const ctx = pieCtx.getContext("2d");
    analysisPieChart = new Chart(ctx, {
      type: "doughnut",
      data: { labels: ["NORMAL", "ALERTA", "EMERGENCIA", "INVALIDO"], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ["#0f766e", "#f59e0b", "#e11d48", "#6b7280"], borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#1c1b18" } },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0) || 1;
                const val = context.parsed;
                const pct = ((val / total) * 100).toFixed(1);
                return context.label + ": " + val + " (" + pct + "%)";
              }
            }
          }
        }
      }
    });
  }

  if (lineCtx) {
    const ctx = lineCtx.getContext("2d");
    analysisLineChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Temp promedio", data: [], borderColor: "#0f766e", backgroundColor: "rgba(15, 118, 110, 0.1)", tension: 0.3, fill: true, yAxisID: "yTemp" },
          { label: "MQ135 promedio", data: [], borderColor: "#4f46e5", backgroundColor: "rgba(79, 70, 229, 0.1)", tension: 0.3, fill: true, yAxisID: "yGas" }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          yTemp: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "Temp (°C)", color: "#0f766e" }, ticks: { color: "#0f766e" } },
          yGas: { type: "linear", position: "right", beginAtZero: true, title: { display: true, text: "MQ135", color: "#4f46e5" }, grid: { drawOnChartArea: false }, ticks: { color: "#4f46e5" } },
          x: { ticks: { color: "#5a4f42" } }
        },
        plugins: {
          legend: { labels: { color: "#1c1b18" } },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || "";
                const val = context.parsed.y;
                if (context.dataset.yAxisID === "yTemp") return label + ": " + val.toFixed(1) + " °C";
                if (context.dataset.yAxisID === "yGas") return label + ": " + val.toFixed(0) + " ppm";
                return label + ": " + val;
              }
            }
          }
        }
      }
    });
  }
}

function updateAnalysisCharts(analisisItems) {
  if (!analysisBarChart) buildAnalysisCharts();
  if (!analisisItems || !analisisItems.length) return;

  const byDevice = {};
  analisisItems.forEach(item => {
    const key = item.device_id || "desconocido";
    if (!byDevice[key]) byDevice[key] = [];
    byDevice[key].push(item);
  });

  const deviceLabels = Object.keys(byDevice);
  const tempAvgs = deviceLabels.map(d => {
    const vals = byDevice[d].map(i => Number(i.temp_promedio)).filter(v => Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });
  const gasAvgs = deviceLabels.map(d => {
    const vals = byDevice[d].map(i => Number(i.mq135_promedio)).filter(v => Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });

  if (analysisBarChart) {
    analysisBarChart.data.labels = deviceLabels;
    analysisBarChart.data.datasets[0].data = tempAvgs;
    analysisBarChart.data.datasets[1].data = gasAvgs;
    analysisBarChart.update();
  }

  if (analysisLineChart) {
    const sorted = [...analisisItems].sort((a, b) => {
      const da = parseTimestamp(a.fecha_generacion) || 0;
      const db = parseTimestamp(b.fecha_generacion) || 0;
      return da - db;
    });
    analysisLineChart.data.labels = sorted.map(i => formatDateShort(i.fecha_generacion));
    analysisLineChart.data.datasets[0].data = sorted.map(i => Number(i.temp_promedio) || null);
    analysisLineChart.data.datasets[1].data = sorted.map(i => Number(i.mq135_promedio) || null);
    analysisLineChart.update();
  }
}

function updateRiskChart(eventosItems) {
  if (!analysisPieChart) buildAnalysisCharts();
  if (!eventosItems || !eventosItems.length) return;
  const counts = { NORMAL: 0, ALERTA: 0, EMERGENCIA: 0, INVALIDO: 0 };
  eventosItems.forEach(item => {
    const r = (item.estado_riesgo || "INVALIDO").toUpperCase();
    if (counts[r] !== undefined) counts[r]++;
    else counts.INVALIDO++;
  });
  if (analysisPieChart) {
    analysisPieChart.data.datasets[0].data = [counts.NORMAL, counts.ALERTA, counts.EMERGENCIA, counts.INVALIDO];
    analysisPieChart.update();
  }
}

function getLatestAnalysisDate(items) {
  const dates = (items || []).map(i => i.fecha_generacion).filter(Boolean);
  if (!dates.length) return null;
  dates.sort((a, b) => b.localeCompare(a));
  return dates[0];
}

// ---- Analysis data load ----
async function loadAnalysis() {
  try {
    const [summary, incData, limpiasData, brutasData, analData, eventosData] = await Promise.all([
      fetchJson(`${API_BASE}/analysis/summary`),
      fetchJson(`${API_BASE}/analysis/incidencias?limit=20`),
      fetchJson(`${API_BASE}/analysis/limpias?limit=20`),
      fetchJson(`${API_BASE}/analysis/brutas?limpio=0&limit=12`),
      fetchJson(`${API_BASE}/analysis/analisis?limit=200`),
      fetchJson(`${API_BASE}/analysis/eventos?limit=200`)
    ]);

    if (countBrutas) countBrutas.textContent = formatNumber(summary.total_brutas);
    if (countPendientes) countPendientes.textContent = formatNumber(summary.total_pendientes);
    if (countLimpias) countLimpias.textContent = formatNumber(summary.total_limpias);
    if (countIncidencias) countIncidencias.textContent = formatNumber(summary.total_incidencias);
    if (countAnalisis) countAnalisis.textContent = formatNumber(summary.total_analisis);
    if (countEventos) countEventos.textContent = formatNumber(summary.total_eventos);
    if (tabPendingCount) tabPendingCount.textContent = formatNumber(summary.total_pendientes);
    if (tabIncidenciasCount) tabIncidenciasCount.textContent = formatNumber(summary.total_incidencias);
    if (tabLimpiasCount) tabLimpiasCount.textContent = formatNumber(summary.total_limpias);
    if (tabAnalisisCount) tabAnalisisCount.textContent = formatNumber(summary.total_analisis);
    if (tabEventosCount) tabEventosCount.textContent = formatNumber(summary.total_eventos);
    if (ultimaBruta) ultimaBruta.textContent = formatTimestamp(summary.ultima_medicion);
    if (ultimaLimpia) ultimaLimpia.textContent = formatTimestamp(summary.ultima_limpia);
    if (ultimaIncidencia) ultimaIncidencia.textContent = formatTimestamp(summary.ultima_incidencia);
    if (ultimaAnalisis) ultimaAnalisis.textContent = formatTimestamp(summary.ultima_analisis);
    if (ultimoEvento) ultimoEvento.textContent = formatTimestamp(summary.ultimo_evento);

    renderBreakdown(qualityBreakdown, summary.calidad || [], (row) => (Number(row.limpio) === 1 ? "Procesadas" : "Pendientes"));
    renderBreakdown(riskBreakdown, summary.riesgos || [], (row) => row.estado_riesgo || "SIN ESTADO");
    renderBreakdown(incidentTypeBreakdown, summary.incidencias_por_tipo || [], (row) => row.tipo_incidencia || "SIN TIPO");

    const pendingItems = unwrapItems(brutasData);
    renderTable(pendingTable, ["ID", "Device", "Zona", "Temp", "MQ135", "Fecha"], pendingItems.map(item => [
      item.id, item.device_id, item.zona, formatValue(item.temperatura_c, "C"),
      formatValue(item.mq135_aire), formatTimestamp(item.timestamp_origen || item.created_at)
    ]), 6);

    const incItems = unwrapItems(incData);
    renderTable(incidenciasTable, ["Device", "Tipo", "Detalle", "Fecha"], incItems.map(item => [
      item.device_id, item.tipo_incidencia, item.detalle_incidencia, formatTimestamp(item.created_at)
    ]), 4);

    const limpItems = unwrapItems(limpiasData);
    renderTable(limpiasTable, ["Device", "Riesgo", "Temp", "MQ135", "Fecha"], limpItems.map(item => [
      item.device_id, item.estado_riesgo || "--", formatValue(item.temperatura_c, "C"),
      formatValue(item.mq135_aire), formatTimestamp(item.timestamp_origen || item.created_at)
    ]), 5);

    const analItems = unwrapItems(analData);
    const latestDate = getLatestAnalysisDate(analItems);
    renderAnalysisTable(analisisTable, analItems, latestDate);
    updateAnalysisCharts(analItems);

    const eventItems = unwrapItems(eventosData);
    renderTable(eventosTable, ["Device", "Riesgo", "Motivo", "LED", "Extractor", "Sirena", "Valvula", "Fecha"], eventItems.map(item => [
      item.device_id, item.estado_riesgo, item.motivo_activacion, item.led_estado,
      item.extractor_estado, item.sirena_estado, item.valvula_gas_estado, formatTimestamp(item.created_at)
    ]), 8);
    updateRiskChart(eventItems);
  } catch (err) { console.error(err); }
}

async function triggerClean() {
  setCleanStatus("Lanzando limpieza...");
  if (cleanBtn) cleanBtn.disabled = true;
  try {
    const data = await fetchJson(`${NR_BASE}/api/clean`, { method: "POST" });
    const stamp = formatTimestamp(new Date().toISOString());
    setCleanStatus(`${data.message || "Solicitada"} · ${stamp}`);
    loadAnalysis();
    setTimeout(loadAnalysis, 2500);
  } catch (_err) { setCleanStatus("No se pudo iniciar limpieza."); }
  finally { if (cleanBtn) cleanBtn.disabled = false; }
}

async function triggerMonthlyAnalysis() {
  setMonthlyAnalysisStatus("Lanzando analisis...");
  if (monthlyAnalysisBtn) monthlyAnalysisBtn.disabled = true;
  try {
    const data = await fetchJson(`${API_BASE}/analysis/monthly`, { method: "POST" });
    const stamp = formatTimestamp(new Date().toISOString());
    setMonthlyAnalysisStatus(`${data.message || "Solicitado"} · ${stamp}`);
    switchTablePanel("analisis");
    loadAnalysis();
    setTimeout(loadAnalysis, 2500);
    setTimeout(loadAnalysis, 6000);
  } catch (_err) { setMonthlyAnalysisStatus("No se pudo iniciar analisis mensual."); }
  finally { if (monthlyAnalysisBtn) monthlyAnalysisBtn.disabled = false; }
}

function showPage(target) {
  const isDashboard = target === "dashboard";
  if (dashboardPage) dashboardPage.classList.toggle("active", isDashboard);
  if (analysisPage) analysisPage.classList.toggle("active", !isDashboard);
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.page === target));
  if (!isDashboard) loadAnalysis();
}

function initSse() {
  const sse = new EventSource(`${API_BASE}/stream/latest`);
  let lastAnalysisTs = 0;
  let lastIncidentsTs = 0;
  sse.addEventListener("latest", (event) => {
    setConnection(true, "Conectado");
    try {
      const data = JSON.parse(event.data);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        latestNodes = data.items;
      }
      applyFilters();
      if (selectedId) {
        const latest = latestNodes.find((node) => node.device_id === selectedId);
        if (latest) {
          updateDetail(latest);
          try { appendLatest(latest); } catch (e) { console.error("appendLatest:", e); }
          try { updateGauges(latest); } catch (e) { console.error("updateGauges:", e); }
          try { updateActuators(latest); } catch (e) { console.error("updateActuators:", e); }
        }
      }
    } catch (_) { /* ignore parse errors */ }
    const now = Date.now();
    if (now - lastAnalysisTs >= ANALYSIS_REFRESH_MS) {
      lastAnalysisTs = now;
      loadAnalysis();
    }
    if (selectedId && now - lastIncidentsTs >= ANALYSIS_REFRESH_MS) {
      lastIncidentsTs = now;
      loadIncidencias(selectedId);
    }
  });
  sse.addEventListener("error", () => setConnection(false, "Reconectando..."));
}

refreshBtn.addEventListener("click", loadNodesOnce);
searchInput.addEventListener("input", applyFilters);
zonaFilter.addEventListener("change", applyFilters);
riskFilter.addEventListener("change", applyFilters);
tabs.forEach((tab) => tab.addEventListener("click", () => showPage(tab.dataset.page)));
if (analysisRefresh) analysisRefresh.addEventListener("click", loadAnalysis);
if (cleanBtn) cleanBtn.addEventListener("click", triggerClean);
if (monthlyAnalysisBtn) monthlyAnalysisBtn.addEventListener("click", triggerMonthlyAnalysis);
tableTabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTablePanel(button.dataset.tableTab));
  button.addEventListener("keydown", (event) => {
    const tabList = Array.from(tableTabButtons);
    const currentIndex = tabList.indexOf(button);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabList.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabList.length) % tabList.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabList.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      tabList[nextIndex].focus();
      switchTablePanel(tabList[nextIndex].dataset.tableTab);
    }
  });
});
document.querySelectorAll("[data-state]").forEach((btn) => btn.addEventListener("click", () => sendState(btn.dataset.state)));

try { buildCharts(); } catch (e) { console.error("buildCharts:", e); }
try { buildGauges(); } catch (e) { console.error("buildGauges:", e); }
try { buildAnalysisCharts(); } catch (e) { console.error("buildAnalysisCharts:", e); }
loadNodesOnce();
initSse();
showPage("dashboard");
