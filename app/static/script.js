(() => {
  const REFRESH_MS = 2000;
  const HISTORY_LEN = 60;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const MIN_CHART_RANGE = 10; 

  const els = {
    livePill: document.getElementById("live-pill"),
    liveText: document.getElementById("live-text"),
    monitorStatus: document.getElementById("monitor-status"),
    connectionStatus: document.getElementById("connection-status"),
    lastUpdated: document.getElementById("last-updated"),
    chartLiveTag: document.getElementById("chart-live-tag"),

    hostName: document.getElementById("host-name"),
    hostUptime: document.getElementById("host-uptime"),
    systemStatusDot: document.getElementById("system-status-dot"),
    systemStatusText: document.getElementById("system-status-text"),

    cpuRing: document.getElementById("cpu-ring"),
    cpuPercent: document.getElementById("cpu-percent"),
    cpuDetail: document.getElementById("cpu-detail"),

    memRing: document.getElementById("mem-ring"),
    memPercent: document.getElementById("mem-percent"),
    memDetail: document.getElementById("mem-detail"),

    diskRing: document.getElementById("disk-ring"),
    diskPercent: document.getElementById("disk-percent"),
    diskDetail: document.getElementById("disk-detail"),

    procCount: document.getElementById("proc-count"),

    memAvailable: document.getElementById("mem-available"),
    swapUsed: document.getElementById("swap-used"),
    swapTotal: document.getElementById("swap-total"),

    netSent: document.getElementById("net-sent"),
    netRecv: document.getElementById("net-recv"),
    netPacketsSent: document.getElementById("net-packets-sent"),
    netPacketsRecv: document.getElementById("net-packets-recv"),

    cpuFreqCurrent: document.getElementById("cpu-freq-current"),
    cpuFreqMax: document.getElementById("cpu-freq-max"),
    cpuCoresDetail: document.getElementById("cpu-cores-detail"),

    canvas: document.getElementById("cpu-chart"),
  };

  const ctx = els.canvas.getContext("2d");
  const cpuHistory = [];
  let failCount = 0;

  const STATUS_LABEL = { good: "System status: Good", warning: "System status: Warning", critical: "System status: Critical" };

  [els.cpuRing, els.memRing, els.diskRing].forEach((ring) => {
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  });

  function setRing(ring, percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
    ring.style.strokeDashoffset = String(offset);
  }

  function setConnection(isOnline) {
    els.livePill.classList.toggle("online", isOnline);
    els.livePill.classList.toggle("offline", !isOnline);
    els.liveText.textContent = isOnline ? "Live" : "Disconnected";
    els.monitorStatus.textContent = isOnline ? "Online" : "Offline";
    els.connectionStatus.textContent = isOnline ? "Connected" : "Retrying\u2026";
    els.chartLiveTag.textContent = isOnline ? "LIVE" : "PAUSED";
    els.chartLiveTag.classList.toggle("paused", !isOnline);
  }

  function setSystemStatus(status) {
    els.systemStatusDot.classList.remove("good", "warning", "critical");
    els.systemStatusDot.classList.add(status);
    els.systemStatusText.textContent = STATUS_LABEL[status] || "System status: Unknown";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + " " + units[i];
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    els.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function chartBounds() {
    let min = Math.min(...cpuHistory);
    let max = Math.max(...cpuHistory);
    let range = max - min;

    if (range < MIN_CHART_RANGE) {
      const mid = (max + min) / 2;
      min = mid - MIN_CHART_RANGE / 2;
      max = mid + MIN_CHART_RANGE / 2;
    }

    const pad = (max - min) * 0.18;
    min -= pad;
    max += pad;

    if (min < 0) { max -= min; min = 0; }
    if (max > 100) { min -= (max - 100); max = 100; }
    min = Math.max(0, min);

    return { min, max };
  }

  function drawChart() {
    const rect = els.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (cpuHistory.length < 2) return;

    const { min, max } = chartBounds();
    const span = Math.max(max - min, 1);

    const padTop = 8;
    const padBottom = 4;
    const usableH = h - padTop - padBottom;
    const stepX = w / (HISTORY_LEN - 1);
    const startIdx = HISTORY_LEN - cpuHistory.length;

    const pointX = (i) => (startIdx + i) * stepX;
    const pointY = (v) => padTop + usableH * (1 - (v - min) / span);

    // Filled area under the curve
    ctx.beginPath();
    ctx.moveTo(pointX(0), h - padBottom);
    cpuHistory.forEach((v, i) => ctx.lineTo(pointX(i), pointY(v)));
    ctx.lineTo(pointX(cpuHistory.length - 1), h - padBottom);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(34, 211, 238, 0.28)");
    grad.addColorStop(1, "rgba(34, 211, 238, 0.0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    cpuHistory.forEach((v, i) => {
      const x = pointX(i);
      const y = pointY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Latest point marker
    const lastX = pointX(cpuHistory.length - 1);
    const lastY = pointY(cpuHistory[cpuHistory.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#22d3ee";
    ctx.fill();
  }

  function pushHistory(value) {
    cpuHistory.push(value);
    if (cpuHistory.length > HISTORY_LEN) cpuHistory.shift();
  }

  function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  async function poll() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status " + res.status);
      const data = await res.json();

      failCount = 0;
      setConnection(true);

      els.hostName.textContent = data.host.name;
      els.hostUptime.textContent = data.host.uptime;
      setSystemStatus(data.host.status);

      setRing(els.cpuRing, data.cpu.percent);
      els.cpuPercent.textContent = data.cpu.percent.toFixed(1) + "%";
      els.cpuDetail.textContent = data.cpu.cores + " logical cores";

      setRing(els.memRing, data.memory.percent);
      els.memPercent.textContent = data.memory.percent.toFixed(1) + "%";
      els.memDetail.textContent = data.memory.used_gb + " / " + data.memory.total_gb + " GB";

      setRing(els.diskRing, data.disk.percent);
      els.diskPercent.textContent = data.disk.percent.toFixed(1) + "%";
      els.diskDetail.textContent = data.disk.used_gb + " / " + data.disk.total_gb + " GB";

      els.procCount.textContent = data.processes.count;

      els.memAvailable.textContent = data.memory.available_gb + " GB";
      els.swapUsed.textContent = data.memory.swap_used_gb + " GB";
      els.swapTotal.textContent = data.memory.swap_total_gb + " GB";

      els.netSent.textContent = formatBytes(data.network.bytes_sent);
      els.netRecv.textContent = formatBytes(data.network.bytes_recv);
      els.netPacketsSent.textContent = data.network.packets_sent.toLocaleString();
      els.netPacketsRecv.textContent = data.network.packets_recv.toLocaleString();

      els.cpuFreqCurrent.textContent = data.cpu.freq_current_ghz ? data.cpu.freq_current_ghz + " GHz" : "N/A";
      els.cpuFreqMax.textContent = data.cpu.freq_max_ghz ? data.cpu.freq_max_ghz + " GHz" : "N/A";
      els.cpuCoresDetail.textContent = data.cpu.cores;

      els.lastUpdated.textContent = formatTime(data.timestamp);

      pushHistory(data.cpu.percent);
      drawChart();
    } catch (err) {
      failCount += 1;
      if (failCount >= 2) setConnection(false);
    }
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawChart();
  });

  resizeCanvas();
  poll();
  setInterval(poll, REFRESH_MS);
})();