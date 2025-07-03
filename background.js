let currentInputFieldConfigs = [];

// Debug logging utility for background script
function debugLogBackground(message, data = null, isError = false) {
  const timestamp = new Date().toISOString();

  // Enhanced caller information detection
  const stack = new Error().stack;
  let callerInfo = "background.js:?";

  if (stack) {
    const stackLines = stack.split("\n").filter((line) => line.trim());

    // Skip internal functions to find the actual caller
    let callerLine = null;
    for (let i = 0; i < stackLines.length; i++) {
      const line = stackLines[i];

      // Skip these internal functions
      if (
        line.includes("debugLogBackground") ||
        line.includes("debugLogBackgroundError")
      ) {
        continue;
      }

      // This should be our actual caller
      callerLine = line;
      break;
    }

    if (callerLine) {
      // Try multiple regex patterns to extract file and line info
      let match = null;

      // Pattern 1: at functionName (file:line:column)
      match = callerLine.match(/at\s+.*?\s+\(([^)]+):(\d+):(\d+)\)/);

      if (!match) {
        // Pattern 2: at file:line:column
        match = callerLine.match(/at\s+([^:]+):(\d+):(\d+)/);
      }

      if (!match) {
        // Pattern 3: (file:line:column)
        match = callerLine.match(/\(([^)]+):(\d+):(\d+)\)/);
      }

      if (!match) {
        // Pattern 4: Just look for any file pattern
        match = callerLine.match(/([^\/\\]+\.(js|ts)):(\d+)/);
      }

      if (match) {
        const filePath = match[1];
        const lineNumber = match[2] || match[3] || "?";

        // Extract just the filename from full path
        const fileName = filePath.split("/").pop().split("\\").pop();
        callerInfo = `${fileName}:${lineNumber}`;
      } else {
        // Fallback: try to extract any meaningful info from the line
        const cleanLine = callerLine.replace(/^\s*at\s*/, "").trim();
        if (cleanLine.length > 0 && cleanLine !== "Object.<anonymous>") {
          callerInfo = cleanLine.substring(0, 50); // Limit length
        } else {
          callerInfo = "background.js:?";
        }
      }
    } else {
      // If no suitable line found, default to background.js
      callerInfo = "background.js:?";
    }
  } else {
    callerInfo = "background.js:?";
  }

  const logType = isError ? "[ERROR]" : "[BACKGROUND]";
  const logMessage = `[LinkedIn AutoApply Background] ${timestamp} [${callerInfo}]: ${logType} ${message}`;
  console.log("[DEBUGGER](BACKGROUND LOG): ", logMessage);
  if (data) {
    console.log("[DEBUGGER](BACKGROUND DATA): ", data);
  }

  // Store debug logs in local storage
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
        source: "background",
      });
      // Keep only last 50 logs
      if (logs.length > 50) {
        logs.splice(0, logs.length - 50);
      }
      chrome.storage.local.set({ debugLogs: logs });
    });
  } catch (error) {
    console.error("[DEBUGGER](BACKGROUND ERROR storing log): ", error);
  }
}

// Error logging for background
function debugLogBackgroundError(message, error = null) {
  const errorData = error
    ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      }
    : null;

  debugLogBackground(message, errorData, true);
}

function deleteInputFieldConfig(placeholder) {
  chrome.storage.local.get(["inputFieldConfigs"], (result) => {
    const inputFieldConfigs = result?.inputFieldConfigs || [];
    const configIndex = inputFieldConfigs.findIndex(
      (config) => config.placeholderIncludes === placeholder
    );
    if (configIndex !== -1) {
      inputFieldConfigs.splice(configIndex, 1);
    } else {
      return;
    }
    chrome.storage.local.set({ inputFieldConfigs: inputFieldConfigs }, () => {
      currentInputFieldConfigs = inputFieldConfigs;
    });
  });
}

async function saveLinkedInJobData(jobTitle, jobLink, companyName) {
  try {
    const storageResult = await chrome.storage.local.get("externalApplyData");
    const storedData = storageResult?.externalApplyData || [];
    storedData.push({
      title: jobTitle,
      link: jobLink,
      companyName,
      time: Date.now(),
    });
    const uniqData = [];
    const seenLinks = new Set();
    const seenTitleAndCompany = new Set();
    for (const item of storedData) {
      const uniqKeyLink = `${item.link}`;
      const uniqKeyTitleName = `${item.title}-${item.companyName}`;

      if (
        !seenLinks.has(uniqKeyLink) &&
        !seenTitleAndCompany.has(uniqKeyTitleName)
      ) {
        seenLinks.add(uniqKeyLink);
        seenTitleAndCompany.add(uniqKeyTitleName);
        uniqData.push(item);
      }
    }

    const sortedData = uniqData.sort((a, b) => b.time - a.time);
    await chrome.storage.local.set({ externalApplyData: sortedData });

    debugLogBackground("LinkedIn job data saved successfully", {
      jobTitle,
      companyName,
      totalJobs: sortedData.length,
    });
  } catch (error) {
    debugLogBackgroundError("Failed to save LinkedIn job data", error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "externalApplyAction") {
      const { jobTitle, currentPageLink, companyName } = request.data;
      saveLinkedInJobData(jobTitle, currentPageLink, companyName)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          // Error already logged in saveLinkedInJobData function
          sendResponse({ success: false, error: error.message });
        });
      return true;
    } else if (request.action === "openDefaultInputPage") {
      chrome.tabs.create({ url: "popup/formControl/formControl.html" });
    } else if (request.action === "startAutoApply") {
      try {
        chrome.tabs
          .query({ active: true, currentWindow: true })
          .then((tabs) => {
            if (!tabs?.[0]) {
              debugLogBackgroundError(
                "No active tab found during startAutoApply"
              );
              sendResponse({ success: false, message: "No active tab found." });
              return true;
            }
            const currentTabId = tabs?.[0]?.id;
            const currentUrl = tabs?.[0]?.url || "";
            chrome.storage.local.get("defaultFields", (storageResult) => {
              if (storageResult?.defaultFields) {
                if (!storageResult?.defaultFields) {
                  sendResponse({
                    success: false,
                    message: "Default fields are not set.",
                  });
                  return true;
                }
                const result = storageResult.defaultFields;
                const isDefaultFieldsEmpty = Object.values(result).some(
                  (value) => value === ""
                );
                if (!currentUrl.includes("linkedin.com/jobs")) {
                  chrome.tabs
                    .sendMessage(currentTabId, {
                      action: "showNotOnJobSearchAlert",
                    })
                    .then(() =>
                      sendResponse({
                        success: false,
                        message:
                          "You are not on the LinkedIn jobs search page.",
                      })
                    )
                    .catch((err) => {
                      const errorMessage = err?.message || "Unknown error";
                      if (errorMessage.includes("establish connection"))
                        return false;
                      debugLogBackgroundError(
                        "Error showing not on job search alert",
                        err
                      );
                      sendResponse({
                        success: false,
                        message: "Error showing alert: " + err.message,
                      });
                    });
                  return true;
                }
                if (isDefaultFieldsEmpty) {
                  chrome.tabs
                    .sendMessage(currentTabId, {
                      action: "showFormControlAlert",
                    })
                    .then(() =>
                      sendResponse({
                        success: false,
                        message:
                          "Form control fields are empty.  Please set them in the extension options.",
                      })
                    )
                    .catch((err) => {
                      debugLogBackgroundError(
                        "Error sending showFormControlAlert",
                        err
                      );
                      sendResponse({
                        success: false,
                        message:
                          "Error showing form control alert: " + err.message,
                      });
                    });
                  return true;
                }
                if (
                  currentUrl.includes("linkedin.com/jobs") &&
                  !isDefaultFieldsEmpty
                ) {
                  chrome.scripting
                    .executeScript({
                      target: { tabId: currentTabId },
                      func: runScriptInContent,
                    })
                    .then(() => {
                      debugLogBackground(
                        "Auto-apply script started successfully",
                        {
                          tabId: currentTabId,
                          url: currentUrl,
                        }
                      );
                      sendResponse({ success: true });
                    })
                    .catch((err) => {
                      debugLogBackgroundError(
                        "startAutoApply executeScript Error",
                        err
                      );
                      sendResponse({ success: false, message: err.message });
                    });
                }
              }
            });
            return true;
          });
        return true;
      } catch (err) {
        debugLogBackgroundError("startAutoApply general Error", err);
        sendResponse({ success: false, message: err.message });
      }
    } else if (request.action === "stopAutoApply") {
      chrome.storage.local.set({ autoApplyRunning: false }, () => {
        chrome.tabs
          .query({ active: true, currentWindow: true })
          .then((tabs) => {
            if (!tabs?.[0]) {
              debugLogBackgroundError(
                "No active tab found during stopAutoApply"
              );
              sendResponse({ success: false, message: "No active tab found." });
              return;
            }
            const currentTabId = tabs[0].id;
            chrome.tabs.get(currentTabId, (tab) => {
              if (chrome.runtime.lastError) {
                debugLogBackgroundError("Error getting tab info", {
                  message: chrome?.runtime?.lastError?.message,
                });
                sendResponse({
                  success: false,
                  message: "Tab error: " + chrome.runtime.lastError.message,
                });
                return;
              }

              if (!tab || !tab.url || !tab.url.includes("linkedin.com/jobs")) {
                debugLogBackgroundError(
                  "Tab is invalid or URL does not match",
                  {
                    tabUrl: tab?.url,
                  }
                );
                sendResponse({
                  success: false,
                  message: "Tab is invalid or not a LinkedIn jobs page.",
                });
                return;
              }

              chrome.tabs
                .sendMessage(currentTabId, { action: "hideRunningModal" })
                .then((response) => {
                  if (response && response.success) {
                    debugLogBackground(
                      "Auto-apply script stopped successfully",
                      {
                        tabId: currentTabId,
                      }
                    );
                    sendResponse({ success: true });
                  } else {
                    sendResponse({
                      success: false,
                      message: "Failed to hide modal on stop.",
                    });
                  }
                })
                .catch((err) => {
                  debugLogBackgroundError(
                    "Error sending hideRunningModal",
                    err
                  );
                  sendResponse({
                    success: false,
                    message: "Failed to send hideRunningModal: " + err?.message,
                  });
                });
            });
          })
          .catch((err) => {
            debugLogBackgroundError(
              "Error querying tabs in stopAutoApply",
              err
            );
            sendResponse({
              success: false,
              message: "Error querying tabs: " + err?.message,
            });
          });
        return true;
      });
      return true;
    } else if (request.action === "openTabAndRunScript") {
      debugLogBackground("Opening new tab for auto-apply", {
        url: request.url,
      });
      chrome.tabs.create({ url: request.url }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === "complete") {
            chrome.tabs
              .sendMessage(tabId, { action: "showRunningModal" })
              .then((response) => {
                if (response && response.success) {
                  chrome.scripting
                    .executeScript({
                      target: { tabId: tabId },
                      func: runScriptInContent,
                    })
                    .then(() => {
                      debugLogBackground(
                        "Auto-apply script started in new tab",
                        {
                          tabId: tabId,
                          url: request.url,
                        }
                      );
                      sendResponse({ success: true });
                    })
                    .catch((err) => {
                      debugLogBackgroundError(
                        "executeScript error in openTabAndRunScript",
                        err
                      );
                      sendResponse({ success: false, message: err.message });
                      chrome.tabs.sendMessage(tabId, {
                        action: "hideRunningModal",
                      });
                    });
                } else {
                  debugLogBackgroundError("Failed to show running modal", {
                    response: response?.message,
                  });
                  sendResponse({
                    success: false,
                    message:
                      response?.message || "Failed to show running modal.",
                  });
                }
              })
              .catch((err) => {
                debugLogBackgroundError(
                  "Error sending showRunningModal in openTabAndRunScript",
                  err
                );
                sendResponse({
                  success: false,
                  message: "Failed to send showRunningModal: " + err?.message,
                });
              });

            chrome.tabs.onUpdated.removeListener(listener);
          }
        });
      });
      return true;
    } else if (request.action === "updateInputFieldValue") {
      const { placeholder, value } = request.data;
      updateOrAddInputFieldValue(placeholder, value)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          debugLogBackgroundError("Error in updateInputFieldValue", err);
          sendResponse({ success: false, message: err?.message });
        });
      return true;
    } else if (request.action === "updateInputFieldConfigsInStorage") {
      const placeholder = request.data;
      updateInputFieldConfigsInStorage(placeholder)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          debugLogBackgroundError(
            "Error in updateInputFieldConfigsInStorage",
            err
          );
          sendResponse({ success: false, message: err?.message });
        });
      return true;
    } else if (request.action === "deleteInputFieldConfig") {
      const placeholder = request.data;
      deleteInputFieldConfig(placeholder);
    } else if (request.action === "getInputFieldConfig") {
      getInputFieldConfig(sendResponse);
      return true;
    } else if (request.action === "updateRadioButtonValueByPlaceholder") {
      updateRadioButtonValue(request.placeholderIncludes, request.newValue);
    } else if (request.action === "deleteRadioButtonConfig") {
      deleteRadioButtonConfig(request.data);
    } else if (request.action === "updateDropdownConfig") {
      updateDropdownConfig(request.data);
    } else if (request.action === "deleteDropdownConfig") {
      deleteDropdownValueConfig(request.data);
    } else if (request.action === "checkAutoApplyStatus") {
      const tabId = request.tabId;
      if (tabId) {
        chrome.tabs
          .sendMessage(tabId, { action: "checkScriptRunning" })
          .then((response) => {
            const isActuallyRunning = response?.isRunning || false;
            chrome.storage.local.set(
              { autoApplyRunning: isActuallyRunning },
              () => {
                sendResponse({ isRunning: isActuallyRunning });
              }
            );
          })
          .catch(() => {
            chrome.storage.local.set({ autoApplyRunning: false }, () => {
              sendResponse({ isRunning: false });
            });
          });
      } else {
        chrome.storage.local.get("autoApplyRunning", ({ autoApplyRunning }) => {
          sendResponse({ isRunning: Boolean(autoApplyRunning) });
        });
      }
      return true;
    }
  } catch (e) {
    debugLogBackgroundError("onMessage error", e);
    sendResponse({ success: false, message: e.message });
  }
});

async function updateOrAddInputFieldValue(placeholder, value) {
  try {
    const { inputFieldConfigs = [] } = await chrome.storage.local.get(
      "inputFieldConfigs"
    );
    const foundConfig = inputFieldConfigs.find(
      (config) => config.placeholderIncludes === placeholder
    );

    if (foundConfig) {
      foundConfig.defaultValue = value;
    } else {
      const newConfig = {
        placeholderIncludes: placeholder,
        defaultValue: value,
        count: 1,
      };
      inputFieldConfigs.push(newConfig);
    }

    await chrome.storage.local.set({ inputFieldConfigs });
  } catch (error) {
    debugLogBackgroundError(
      "Error updating or adding input field value",
      error
    );
    throw error;
  }
}

async function updateInputFieldConfigsInStorage(placeholder) {
  try {
    const result = await chrome.storage.local.get("inputFieldConfigs");
    const inputFieldConfigs = result?.inputFieldConfigs || [];
    const foundConfig = inputFieldConfigs.find(
      (config) => config.placeholderIncludes === placeholder
    );
    if (foundConfig) {
      foundConfig.count++;
      chrome.storage.local.set({ inputFieldConfigs: inputFieldConfigs }, () => {
        currentInputFieldConfigs = inputFieldConfigs;
      });
      if (!("createdAt" in foundConfig) || !foundConfig.createdAt) {
        foundConfig.createdAt = Date.now();
      }
    } else {
      const newConfig = {
        placeholderIncludes: placeholder,
        defaultValue: "",
        count: 1,
        createdAt: Date.now(),
      };
      inputFieldConfigs.push(newConfig);
      chrome.storage.local.set({ inputFieldConfigs: inputFieldConfigs }, () => {
        currentInputFieldConfigs = inputFieldConfigs;
      });
    }
  } catch (error) {
    debugLogBackgroundError("Error updating input field configs", error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "deleteInputFieldConfig") {
    const placeholder = request.data;
    deleteInputFieldConfig(placeholder);
  }
});

function getInputFieldConfig(callback) {
  try {
    chrome.storage.local.get(["inputFieldConfigs"], (result) => {
      const fieldConfig =
        result && result?.inputFieldConfigs ? result?.inputFieldConfigs : null;
      callback(fieldConfig);
    });
  } catch (error) {
    callback(null);
  }
}

function updateRadioButtonValue(placeholderIncludes, newValue) {
  chrome.storage.local.get("radioButtons", (result) => {
    const storedRadioButtons = result.radioButtons || [];
    const storedRadioButtonInfo = storedRadioButtons.find(
      (info) => info.placeholderIncludes === placeholderIncludes
    );
    if (storedRadioButtonInfo) {
      storedRadioButtonInfo.defaultValue = newValue;
      storedRadioButtonInfo.options.forEach((option) => {
        option.selected = option.value === newValue;
      });
      chrome.storage.local.set({ radioButtons: storedRadioButtons });
    } else {
      debugLogBackgroundError(
        `Radio button config not found for placeholder: ${placeholderIncludes}`,
        { placeholderIncludes, newValue }
      );
    }
  });
}

function deleteRadioButtonConfig(placeholder) {
  chrome.storage.local.get("radioButtons", function (result) {
    const radioButtons = result.radioButtons || [];
    const updatedRadioButtons = radioButtons.filter(
      (config) => config.placeholderIncludes !== placeholder
    );
    chrome.storage.local.set({ radioButtons: updatedRadioButtons });
  });
}

function updateDropdownConfig(dropdownData) {
  if (
    !dropdownData ||
    !dropdownData.placeholderIncludes ||
    !dropdownData.value ||
    !dropdownData.options
  ) {
    return;
  }

  chrome.storage.local.get("dropdowns", function (result) {
    let dropdowns = result.dropdowns || [];
    const storedDropdownInfo = dropdowns.find(
      (info) => info.placeholderIncludes === dropdownData.placeholderIncludes
    );
    if (storedDropdownInfo) {
      storedDropdownInfo.value = dropdownData.value;
      storedDropdownInfo.options = dropdownData.options.map((option) => ({
        value: option.value,
        text: option.text || "",
        selected: option.value === dropdownData.value,
      }));

      if (
        !("createdAt" in storedDropdownInfo) ||
        !storedDropdownInfo.createdAt
      ) {
        storedDropdownInfo.createdAt = Date.now();
      }
    } else {
      dropdowns.push({
        placeholderIncludes: dropdownData.placeholderIncludes,
        value: dropdownData.value,
        createdAt: Date.now(),
        options: dropdownData.options.map((option) => ({
          value: option.value,
          text: option.text || "",
          selected: option.value === dropdownData.value,
        })),
      });
    }
    chrome.storage.local.set({ dropdowns });
  });
}

function deleteDropdownValueConfig(placeholder) {
  chrome.storage.local.get("dropdowns", function (result) {
    let dropdowns = result.dropdowns || [];
    const indexToDelete = dropdowns.findIndex(
      (config) => config.placeholderIncludes === placeholder
    );
    if (indexToDelete !== -1) {
      dropdowns.splice(indexToDelete, 1);
      chrome.storage.local.set({ dropdowns: dropdowns });
    }
  });
}

function runScriptInContent() {
  if (typeof runScript === "function") {
    runScript();
  }
}
