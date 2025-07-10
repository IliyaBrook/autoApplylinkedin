function debugLogPopup(message, data = null, isError = false) {
  const timestamp = new Date().toISOString();

  const stack = new Error().stack;
  let callerInfo = "popup.js:?";

  if (stack) {
    const stackLines = stack.split("\n").filter((line) => line.trim());

    let callerLine = null;
    for (let i = 0; i < stackLines.length; i++) {
      const line = stackLines[i];

      if (line.includes("debugLogPopup")) {
        continue;
      }

      callerLine = line;
      break;
    }

    if (callerLine) {
      let match = null;

      match = callerLine.match(/at\s+.*?\s+\(([^)]+):(\d+):(\d+)\)/);

      if (!match) {
        match = callerLine.match(/at\s+([^:]+):(\d+):(\d+)/);
      }

      if (!match) {
        match = callerLine.match(/\(([^)]+):(\d+):(\d+)\)/);
      }

      if (!match) {
        match = callerLine.match(/([^\/\\]+\.(js|ts)):(\d+)/);
      }

      if (match) {
        const filePath = match[1];
        const lineNumber = match[2] || match[3] || "?";

        const fileName = filePath.split("/").pop().split("\\").pop();
        callerInfo = `${fileName}:${lineNumber}`;
      } else {
        const cleanLine = callerLine.replace(/^\s*at\s*/, "").trim();
        if (cleanLine.length > 0 && cleanLine !== "Object.<anonymous>") {
          callerInfo = cleanLine.substring(0, 50);
        } else {
          callerInfo = "popup.js:?";
        }
      }
    } else {
      callerInfo = "popup.js:?";
    }
  } else {
    callerInfo = "popup.js:?";
  }

  const logType = isError ? "[ERROR]" : "[POPUP]";
  const logMessage = `[LinkedIn AutoApply Popup] ${timestamp} [${callerInfo}]: ${logType} ${message}`;
  console.log("[DEBUGGER](POPUP LOG): ", logMessage);
  if (data) {
    console.log("[DEBUGGER](POPUP DATA): ", data);
  }

  try {
    chrome.storage.local.get("debugLogs", (result) => {
      const logs = result.debugLogs || [];
      logs.push({
        timestamp,
        message: `${logType} ${message}`,
        data,
        callerInfo,
        isError: isError,
        isCritical: isError,
        source: "popup",
      });

      if (logs.length > 50) {
        logs.splice(0, logs.length - 50);
      }
      chrome.storage.local.set({ debugLogs: logs });
    });
  } catch (error) {
    console.error("[DEBUGGER](POPUP ERROR storing log): ", error);
  }
}

function debugLogPopupError(message, error = null) {
  const errorData = error
    ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      }
    : null;

  debugLogPopup(message, errorData, true);
}

function changeAutoApplyButton(isRunning, selector) {
  const startIcon = document.getElementById("start-icon");
  const runningIcon = document.getElementById("running-icon");

  if (isRunning) {
    selector.classList.add("running");
    selector.textContent = "Stop Auto Apply";
    if (startIcon) startIcon.style.display = "none";
    if (runningIcon) runningIcon.style.display = "inline";
  } else {
    selector.classList.remove("running");
    selector.textContent = "Start Auto Apply";
    if (startIcon) startIcon.style.display = "inline";
    if (runningIcon) runningIcon.style.display = "none";
  }
}

const getCurrentUrl = () => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "getCurrentUrl" },
          (response) => {
            const url = response?.url;
            if (!url?.includes("linkedin.com/jobs")) {
              alert(
                "Saved is only available on the LinkedIn jobs search page."
              );
              resolve(false);
            }
            resolve(response.url);
          }
        );
      } else {
        reject("Active tab not found");
      }
    });
  });
};

// Modal state
let editingLinkName = null;

function openLinkModal({ edit = false, name = "", url = "" } = {}) {
  document.getElementById("linkModalOverlay").style.display = "flex";
  document.getElementById("linkModalTitle").textContent = edit
    ? "Edit job search link"
    : "Add job search link";
  document.getElementById("linkNameInput").value = name;
  document.getElementById("linkUrlInput").value = url;
  editingLinkName = edit ? name : null;
}
function closeLinkModal() {
  document.getElementById("linkModalOverlay").style.display = "none";
  document.getElementById("linkNameInput").value = "";
  document.getElementById("linkUrlInput").value = "";
  editingLinkName = null;
}
document.getElementById("cancelLinkModalBtn").onclick = closeLinkModal;
document.getElementById("linkModalOverlay").onclick = function (e) {
  if (e.target === this) closeLinkModal();
};

document.getElementById("save-link").onclick = function () {
  getCurrentUrl().then((url) => {
    if (!url) return;
    openLinkModal({ edit: false, name: "", url });
  });
};
document.getElementById("saveLinkModalBtn").onclick = function () {
  const name = document.getElementById("linkNameInput").value.trim();
  const url = document.getElementById("linkUrlInput").value.trim();
  if (!name || !url) {
    alert("Both name and URL are required.");
    return;
  }
  chrome.storage.local.get("savedLinks", (result) => {
    const savedLinks = result.savedLinks || {};
    if (editingLinkName && editingLinkName !== name && name in savedLinks) {
      alert("Link name already exists.");
      return;
    }
    if (!editingLinkName && name in savedLinks) {
      alert("Link name already exists.");
      return;
    }
    if (!editingLinkName && Object.values(savedLinks).includes(url)) {
      alert("Link already exists.");
      return;
    }
    if (editingLinkName) {
      // Edit mode: rename or update url
      const updatedLinks = { ...savedLinks };
      if (editingLinkName !== name) delete updatedLinks[editingLinkName];
      updatedLinks[name] = url;
      chrome.storage.local.set({ savedLinks: updatedLinks }, () => {
        closeLinkModal();
        renderSavedLinks();
      });
    } else {
      // Add mode
      chrome.storage.local.set(
        { savedLinks: { ...savedLinks, [name]: url } },
        () => {
          closeLinkModal();
          renderSavedLinks();
        }
      );
    }
  });
};

function renderSavedLinks() {
  const accordion = document.getElementById("linksAccordion");
  if (!accordion) return;
  const content = accordion.querySelector(".accordion-content");
  chrome.storage.local.get("savedLinks", (result) => {
    const savedLinks = result.savedLinks || {};
    content.innerHTML = "";
    if (Object.keys(savedLinks).length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.textContent = "No saved links available.";
      content.appendChild(emptyMsg);
      return;
    }
    Object.entries(savedLinks).forEach(([name, url]) => {
      const item = document.createElement("div");
      item.className = "saved-link-item";
      const nameEl = document.createElement("span");
      nameEl.textContent = name;
      item.appendChild(nameEl);
      // Go icon button
      const goBtn = document.createElement("button");
      goBtn.className = "icon-btn go-btn";
      goBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 17l6-5-6-5v10z"/></svg>';
      goBtn.title = "Go";
      goBtn.onclick = () => {
        chrome.runtime.sendMessage(
          { action: "openTabAndRunScript", url },
          (response) => {
            debugLogPopup(
              "Result of opening the tab and executing the script",
              { response }
            );
          }
        );
      };
      item.appendChild(goBtn);
      // Edit icon button
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn edit-btn";
      editBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14.06 9L15 9.94L5.92 19H5v-.92L14.06 9zm3.6-6c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.04 0-1.41L18.37 3.29c-.19-.19-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>';
      editBtn.title = "Edit";
      editBtn.onclick = () => {
        openLinkModal({ edit: true, name, url });
      };
      item.appendChild(editBtn);
      // Delete icon button
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn delete-btn";
      delBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      delBtn.title = "Delete";
      delBtn.onclick = () => {
        chrome.storage.local.get("savedLinks", (res) => {
          const links = res.savedLinks || {};
          delete links[name];
          chrome.storage.local.set({ savedLinks: links }, () => {
            renderSavedLinks();
          });
        });
      };
      item.appendChild(delBtn);
      content.appendChild(item);
    });
  });
}

document.addEventListener("click", (event) => {
  if (event.target.tagName === "BUTTON") {
    const buttonId = event.target.id;
    const button = document.getElementById(buttonId);
    switch (buttonId) {
      case "form-control-button":
        chrome.tabs.create({ url: "/popup/formControl/formControl.html" });
        break;
      case "filter-settings-button":
        chrome.tabs.create({
          url: "/popup/filterSettings/filterSettings.html",
        });
        break;
      case "external-apply-button":
        chrome.tabs.create({ url: "/popup/externalApply/externalApply.html" });
        break;
      case "export-button":
        chrome.storage.local.get(null, function (data) {
          const jsonData = JSON.stringify(data, null, 2);
          const blob = new Blob([jsonData], { type: "application/json" });
          const url = URL.createObjectURL(blob);

          const link = document.createElement("a");
          link.href = url;
          const { day, hour, minute, month } = getTime();
          link.download = `autoapply_settings_${day}_${month}_[${hour}_${minute}].json`;
          link.click();

          URL.revokeObjectURL(url);
        });
        break;
      case "import-button":
        document.getElementById("import-file").click();
        break;
      case "save-link":
        // This case is now handled by the new modal logic
        break;
      case "show-links":
        try {
          let accordion = document.getElementById("linksAccordion");

          const dataset = button.dataset;
          if (dataset.open === "true") {
            button.textContent = "Show job search links";
            button.style.backgroundColor = "rgb(9, 2, 214, 0.8)";
            button.dataset.open = "false";
            if (accordion) {
              accordion.style.display = "none";
            }
          } else {
            button.dataset.open = "true";
            button.textContent = "Hide job search link";
            button.style.backgroundColor = "rgb(220,53,69)";

            if (accordion) {
              accordion.style.display = "block";
            }
          }
          if (!accordion) {
            if (dataset.open === "true") {
              accordion = document.createElement("div");
              accordion.id = "linksAccordion";
              accordion.style.border = "1px solid #ccc";
              accordion.style.marginTop = "10px";
              accordion.style.padding = "10px";
              accordion.style.background = "#f9f9f9";
              accordion.style.borderRadius = "4px";
              const content = document.createElement("div");
              content.className = "accordion-content";
              content.style.display = "block";
              accordion.appendChild(content);
              const linksRow = document.querySelector(".links-buttons-row");
              linksRow.parentNode.insertBefore(accordion, linksRow.nextSibling);
            }
          }
          if (accordion && dataset.open === "true") {
            renderSavedLinks();
          }
        } catch (error) {
          debugLogPopupError("Cannot show links case 'show-links'", error);
        }
        break;
      case "debug-logs-button":
        chrome.tabs.create({
          url: "/popup/debugLogs/debugLogs.html",
          active: true,
        });
        break;
      case "start-auto-apply-button":
        if (
          typeof chrome !== "undefined" &&
          chrome?.storage &&
          chrome?.storage.local
        ) {
          chrome.storage.local.get(
            "autoApplyRunning",
            ({ autoApplyRunning }) => {
              const newState = !autoApplyRunning;
              changeAutoApplyButton(newState, button);
              chrome.tabs.query(
                { active: true, currentWindow: true },
                (tabs) => {
                  const noActiveTabsText =
                    "No active tabs found try to go to a LinkedIn job search page or refresh the page.";
                  if (tabs && tabs?.length > 0) {
                    const currentTabId = tabs?.[0].id;
                    chrome.runtime.sendMessage(
                      {
                        action: newState ? "startAutoApply" : "stopAutoApply",
                        tabId: currentTabId,
                      },
                      (response) => {
                        if (response?.success) {
                          chrome.storage.local.set({
                            autoApplyRunning: newState,
                          });
                        } else {
                          chrome.storage.local.set(
                            { autoApplyRunning: false },
                            () => {
                              changeAutoApplyButton(false, button);
                              if (
                                response?.message === "No active tab found."
                              ) {
                                alert(noActiveTabsText);
                              }
                            }
                          );
                        }
                      }
                    );
                  } else {
                    alert(noActiveTabsText);
                  }
                }
              );
            }
          );
        }
    }
  }
});

document
  .getElementById("import-file")
  .addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        if (e?.target?.result && typeof e.target.result === "string") {
          const importedData = JSON.parse(e.target.result);
          chrome.storage.local.set(importedData, function () {
            alert("Settings imported successfully!");
          });
        } else {
          alert("Error reading file.");
        }
      } catch (err) {
        alert("Parsing error JSON. " + err);
      }
    };
    reader.readAsText(file);
  });

document.addEventListener("DOMContentLoaded", () => {
  const autoApplyButton = document.getElementById("start-auto-apply-button");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const currentTabId = tabs[0].id;
      chrome.runtime.sendMessage(
        {
          action: "checkAutoApplyStatus",
          tabId: currentTabId,
        },
        (response) => {
          const isRunning = response?.isRunning || false;
          chrome.storage.local.set({ autoApplyRunning: isRunning }, () => {
            changeAutoApplyButton(isRunning, autoApplyButton);
          });
        }
      );
    } else {
      chrome.storage.local.get("autoApplyRunning", ({ autoApplyRunning }) => {
        changeAutoApplyButton(autoApplyRunning || false, autoApplyButton);
      });
    }
  });

  const switchInput = document.getElementById(
    "stop-if-not-exist-in-form-control"
  );

  chrome.storage.local.get(
    "stopIfNotExistInFormControl",
    ({ stopIfNotExistInFormControl }) => {
      switchInput.checked = Boolean(stopIfNotExistInFormControl);
    }
  );

  switchInput.addEventListener("change", () => {
    void chrome.storage.local.set({
      stopIfNotExistInFormControl: switchInput.checked,
    });
  });

  const loopRunningInput = document.getElementById("loop-running");

  chrome.storage.local.get("loopRunning", ({ loopRunning }) => {
    loopRunningInput.checked = Boolean(loopRunning);
  });

  loopRunningInput.addEventListener("change", () => {
    void chrome.storage.local.set({ loopRunning: loopRunningInput.checked });
  });

  const loopRunningDelayInput = document.getElementById("loop-running-delay");

  chrome.storage.local.get("loopRunningDelay", ({ loopRunningDelay }) => {
    loopRunningDelayInput.value = loopRunningDelay || 0;
  });

  loopRunningDelayInput.addEventListener("input", () => {
    const value = parseInt(loopRunningDelayInput.value) || 0;
    void chrome.storage.local.set({ loopRunningDelay: value });
  });
});
