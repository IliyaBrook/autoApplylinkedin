let allLogs = [];
let filteredLogs = [];
let currentFilter = "all";

document.addEventListener("DOMContentLoaded", function () {
  setupEventListeners();
  loadDebugLogs();
});

function setupEventListeners() {
  document
    .getElementById("refresh-btn")
    .addEventListener("click", loadDebugLogs);
  document.getElementById("clear-btn").addEventListener("click", clearLogs);
  document.getElementById("export-btn").addEventListener("click", exportLogs);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search logs...";
  searchInput.addEventListener("input", function () {
    filterLogs();
  });

  const searchBox = document.createElement("div");
  searchBox.className = "search-box";
  searchBox.appendChild(searchInput);

  const controls = document.querySelector(".controls");
  controls.parentNode.insertBefore(searchBox, controls.nextSibling);

  const filterButtons = document.createElement("div");
  filterButtons.className = "filter-buttons";

  const filters = [
    { key: "all", label: "All" },
    { key: "error", label: "Errors" },
    { key: "critical", label: "Critical" },
    { key: "info", label: "Info" },
    { key: "background", label: "Background" },
    { key: "popup", label: "Popup" },
    { key: "script", label: "Script" },
    { key: "navigation", label: "Navigation" },
    { key: "job", label: "Jobs" },
    { key: "recovery", label: "Recovery" },
    { key: "context", label: "Context" },
    { key: "checkbox", label: "Checkboxes" },
    { key: "modal", label: "Modals" },
  ];

  filters.forEach((filter) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = filter.label;
    btn.addEventListener("click", function () {
      setActiveFilter(filter.key);
      filterLogs();
    });
    if (filter.key === "all") {
      btn.classList.add("active");
    }
    filterButtons.appendChild(btn);
  });

  searchBox.parentNode.insertBefore(filterButtons, searchBox.nextSibling);
}

function setActiveFilter(filterKey) {
  currentFilter = filterKey;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(".filter-btn")
    .parentNode.children[getFilterIndex(filterKey)].classList.add("active");
}

function getFilterIndex(filterKey) {
  const filters = [
    "all",
    "error",
    "critical",
    "info",
    "background",
    "popup",
    "script",
    "navigation",
    "job",
    "recovery",
    "context",
    "checkbox",
    "modal",
  ];
  return filters.indexOf(filterKey);
}

function loadDebugLogs() {
  chrome.storage.local.get("debugLogs", function (result) {
    allLogs = result.debugLogs || [];
    displayStats();
    filterLogs();
    document.getElementById(
      "logs-count"
    ).textContent = `Total logs: ${allLogs.length}`;
  });
}

function displayStats() {
  const stats = calculateStats();

  let statsHtml = `
        <div class="stats">
            <h3>Debug Statistics</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-number">${stats.total}</div>
                    <div class="stat-label">Total Logs</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.errors}</div>
                    <div class="stat-label">Errors</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.critical}</div>
                    <div class="stat-label">Critical</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.info}</div>
                    <div class="stat-label">Info</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.background}</div>
                    <div class="stat-label">Background</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.popup}</div>
                    <div class="stat-label">Popup</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.scriptCalls}</div>
                    <div class="stat-label">Script Calls</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.jobsProcessed}</div>
                    <div class="stat-label">Jobs Processed</div>
                </div>
            </div>
        </div>
    `;

  const logsContainer = document.getElementById("logs-container");
  const existingStats = document.querySelector(".stats");
  if (existingStats) {
    existingStats.remove();
  }
  logsContainer.insertAdjacentHTML("beforebegin", statsHtml);
}

function calculateStats() {
  return {
    total: allLogs.length,
    errors: allLogs.filter(
      (log) =>
        log.isError ||
        log.message.includes("[ERROR]") ||
        log.message.toLowerCase().includes("error")
    ).length,
    critical: allLogs.filter(
      (log) => log.isCritical || log.message.includes("[CRITICAL]")
    ).length,
    info: allLogs.filter((log) => log.message.includes("[INFO]")).length,
    background: allLogs.filter(
      (log) =>
        log.source === "background" || log.message.includes("[BACKGROUND]")
    ).length,
    popup: allLogs.filter(
      (log) => log.source === "popup" || log.message.includes("[POPUP]")
    ).length,
    scriptCalls: allLogs.filter(
      (log) =>
        log.message.includes("runScript") ||
        log.message.includes("startScript") ||
        log.message.includes("stopScript")
    ).length,
    jobsProcessed: allLogs.filter(
      (log) =>
        log.message.includes("clicking job") ||
        log.message.includes("processing job") ||
        log.message.includes("Processing ") ||
        log.message.includes("job list items")
    ).length,
  };
}

function filterLogs() {
  const searchTerm = document
    .querySelector(".search-box input")
    .value.toLowerCase();

  filteredLogs = allLogs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.message.toLowerCase().includes(searchTerm) ||
      (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm));

    let matchesCategory = true;
    if (currentFilter !== "all") {
      switch (currentFilter) {
        case "error":
          matchesCategory =
            log.isError ||
            log.message.includes("[ERROR]") ||
            log.message.toLowerCase().includes("error");
          break;
        case "critical":
          matchesCategory =
            log.isCritical || log.message.includes("[CRITICAL]");
          break;
        case "info":
          matchesCategory = log.message.includes("[INFO]");
          break;
        case "background":
          matchesCategory =
            log.source === "background" || log.message.includes("[BACKGROUND]");
          break;
        case "popup":
          matchesCategory =
            log.source === "popup" || log.message.includes("[POPUP]");
          break;
        case "script":
          matchesCategory =
            log.message.includes("runScript") ||
            log.message.includes("startScript") ||
            log.message.includes("stopScript");
          break;
        case "navigation":
          matchesCategory =
            log.message.includes("goToNextPage") ||
            log.message.includes("handleLoopRestart") ||
            log.message.includes("navigation");
          break;
        case "job":
          matchesCategory =
            log.message.includes("clickJob") ||
            log.message.includes("job") ||
            log.message.includes("runFindEasyApply") ||
            log.message.includes("Processing ");
          break;
        case "recovery":
          matchesCategory =
            log.message.includes("recovery") ||
            log.message.includes("auto-recovery") ||
            log.message.includes("attemptScriptRecovery") ||
            log.message.includes("Recovery conditions");
          break;
        case "context":
          matchesCategory =
            log.message.includes("Extension context") ||
            log.message.includes("context monitoring") ||
            log.message.includes("beforeunload") ||
            log.message.includes("context check");
          break;
        case "checkbox":
          matchesCategory =
            log.message.includes("checkbox") ||
            log.message.includes("Checkbox") ||
            log.message.includes("Processing checkbox") ||
            (log.message.includes("Found") &&
              log.message.includes("checkboxes")) ||
            log.data?.action === "checkbox_checked" ||
            log.data?.action === "checkbox_skipped";
          break;
        case "modal":
          matchesCategory =
            log.message.includes("modal") ||
            log.message.includes("Modal") ||
            log.message.includes("Save application") ||
            log.message.includes("terminateJobModel") ||
            log.message.includes("handleSaveApplicationModal") ||
            log.message.includes("Discard") ||
            log.message.includes("Dismiss");
          break;
      }
    }

    return matchesSearch && matchesCategory;
  });

  displayLogs();
}

function displayLogs() {
  const logsContainer = document.getElementById("logs-container");

  if (filteredLogs.length === 0) {
    logsContainer.innerHTML = `
            <div class="empty-state">
                <h3>No logs found</h3>
                <p>No debug logs match your current filter criteria.</p>
            </div>
        `;
    return;
  }

  const sortedLogs = [...filteredLogs].reverse();

  const logsHtml = sortedLogs
    .map((log) => {
      const logClass = getLogClass(log);
      const logType = getLogType(log);
      const stackTrace = formatStackTrace(log.callerInfo || "unknown:?");

      return `
            <div class="log-entry ${logClass}">
                <div class="log-header">
                    <div class="log-timestamp">${formatTimestamp(
                      log.timestamp
                    )}</div>
                    <div class="log-type ${logType.toLowerCase()}">[${logType}]</div>
                </div>
                <div class="log-message">${escapeHtml(log.message)}</div>
                ${
                  stackTrace !== "unknown:?"
                    ? `<div class="log-stack">
                        <div class="log-section-title">Call Stack:</div>
                        <div class="log-data">${stackTrace}</div>
                       </div>`
                    : ""
                }
                ${
                  log.data
                    ? `<div class="log-json">
                        <div class="log-section-title">Data:</div>
                        <div class="log-data">${escapeHtml(
                          JSON.stringify(log.data, null, 2)
                        )}</div>
                       </div>`
                    : ""
                }
            </div>
        `;
    })
    .join("");

  logsContainer.innerHTML = logsHtml;
}

function formatStackTrace(stackTrace) {
  if (!stackTrace || stackTrace === "unknown:?") {
    return "unknown:?";
  }

  return escapeHtml(stackTrace);
}

function getLogType(log) {
  if (log.isError || log.message.includes("[ERROR]")) return "ERROR";
  if (log.isCritical || log.message.includes("[CRITICAL]")) return "CRITICAL";
  if (log.message.includes("[INFO]")) return "INFO";
  if (log.source === "background" || log.message.includes("[BACKGROUND]"))
    return "BACKGROUND";
  if (log.source === "popup" || log.message.includes("[POPUP]")) return "POPUP";
  if (
    log.message.toLowerCase().includes("recovery") ||
    log.message.toLowerCase().includes("auto-recovery")
  )
    return "RECOVERY";
  if (
    log.message.toLowerCase().includes("extension context") ||
    log.message.toLowerCase().includes("context monitoring") ||
    log.message.toLowerCase().includes("beforeunload")
  )
    return "CONTEXT";
  if (
    log.message.toLowerCase().includes("script") ||
    log.message.toLowerCase().includes("runscript")
  )
    return "SCRIPT";
  if (
    log.message.toLowerCase().includes("navigation") ||
    log.message.toLowerCase().includes("page")
  )
    return "NAVIGATION";
  if (
    log.message.toLowerCase().includes("job") ||
    log.message.toLowerCase().includes("apply")
  )
    return "JOBS";
  if (
    log.message.toLowerCase().includes("checkbox") ||
    log.data?.action === "checkbox_checked" ||
    log.data?.action === "checkbox_skipped"
  )
    return "CHECKBOX";
  if (
    log.message.toLowerCase().includes("modal") ||
    log.message.toLowerCase().includes("save application") ||
    log.message.toLowerCase().includes("terminatejobmodel") ||
    log.message.toLowerCase().includes("discard") ||
    log.message.toLowerCase().includes("dismiss")
  )
    return "MODAL";
  return "DEBUG";
}

function getLogClass(log) {
  const type = getLogType(log);
  switch (type) {
    case "ERROR":
      return "error";
    case "CRITICAL":
      return "critical";
    case "INFO":
      return "info";
    case "BACKGROUND":
      return "background";
    case "POPUP":
      return "popup";
    case "RECOVERY":
      return "recovery";
    case "CONTEXT":
      return "context";
    case "SCRIPT":
      return "script";
    case "NAVIGATION":
      return "navigation";
    case "JOBS":
      return "job";
    case "CHECKBOX":
      return "checkbox";
    case "MODAL":
      return "modal";
    case "DEBUG":
      return "debug";
    default:
      return "info";
  }
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function clearLogs() {
  if (confirm("Are you sure you want to clear all debug logs?")) {
    chrome.storage.local.remove("debugLogs", function () {
      allLogs = [];
      filteredLogs = [];
      displayStats();
      displayLogs();
      document.getElementById("logs-count").textContent = "Total logs: 0";
    });
  }
}

function exportLogs() {
  const dataStr = JSON.stringify(allLogs, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(dataBlob);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  link.download = `linkedin-autoapply-debug-logs-${timestamp}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(link.href);
}
