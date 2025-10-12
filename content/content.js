let autoApplyRunning = false;
let userDataObject = {};
let extensionContextCheckInterval = null;
let saveModalCheckInterval = null;
let isSaveModalBeingHandled = false;
let lastSaveModalHandleTime = 0;
let saveModalDetectedTime = 0;
let saveModalFailureCount = 0;
const MAX_SAVE_MODAL_WAIT_TIME = 30000;
const MAX_SAVE_MODAL_FAILURES = 5;

let defaultFields = {
  YearsOfExperience: "",
  City: "",
  FirstName: "",
  LastName: "",
  Email: "",
  PhoneNumber: "",
};

let prevSearchValue = "";

function debugLog(message, data = null, forceLog = false, callerInfo) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  if (!forceLog) {
    try {
      chrome.storage.local.get("autoApplyRunning", (result) => {
        if (!isExtensionContextValidQuiet()) {
          return;
        }

        if (chrome.runtime.lastError) {
          return;
        }
        if (!result?.autoApplyRunning) {
          return;
        }
        writeLog(message, data, false, "SCRIPT", callerInfo);
      });
    } catch (error) {
      return null;
    }
  } else {
    writeLog(message, data, true, "SCRIPT", callerInfo);
  }
}

function debugLogError(message, error = null, callerInfo) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  const errorData = error
    ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      }
    : null;

  writeLog(message, errorData, true, "ERROR", callerInfo);
}

function debugLogCritical(message, data = null, callerInfo) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  writeLog(message, data, true, "CRITICAL", callerInfo);
}

function debugLogInfo(message, data = null, callerInfo = null) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  try {
    chrome.storage.local.get("autoApplyRunning", (result) => {
      if (!isExtensionContextValidQuiet()) {
        return;
      }

      if (chrome.runtime.lastError) {
        return;
      }
      if (!result?.autoApplyRunning) {
        return;
      }
      writeLog(message, data, false, "INFO", callerInfo);
    });
  } catch (error) {
    return null;
  }
}

function writeLog(
  message,
  data = null,
  isForced = false,
  logType = "SCRIPT",
  callerInfo = null
) {
  const timestamp = new Date().toISOString();
  try {
    if (!isExtensionContextValidQuiet()) {
      return;
    }

    chrome.storage.local.get("debugLogs", (result) => {
      if (!isExtensionContextValidQuiet()) {
        return;
      }

      if (chrome.runtime.lastError) {
        return;
      }

      const logs = result.debugLogs || [];

      const enhancedData = data || {};
      if (logType === "CRITICAL") {
        try {
          enhancedData.url = window.location.href;
          enhancedData.readyState = document.readyState;
          enhancedData.timestamp = timestamp;
        } catch (error) {}
      }

      logs.push({
        timestamp,
        message,
        data: enhancedData,
        callerInfo,
        logType,
        isError: logType === "ERROR",
        isCritical: logType === "CRITICAL" || isForced,
      });

      if (logs.length > 2000) {
        logs.splice(0, logs.length - 2000);
      }

      if (!isExtensionContextValidQuiet()) {
        return;
      }

      chrome.storage.local.set({ debugLogs: logs });
    });
  } catch (error) {
    return null;
  }
}

function isExtensionContextValidQuiet() {
  try {
    if (!chrome || !chrome.runtime || !chrome.storage) {
      return false;
    }

    if (!chrome.runtime.id) {
      return false;
    }

    return !(!chrome.runtime.sendMessage || !chrome.storage.local);
  } catch (error) {
    return false;
  }
}

function setAutoApplyRunningSilent(value) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  try {
    chrome.storage.local.set({ autoApplyRunning: value });
  } catch (error) {}
}

async function updateScriptActivity() {
  try {
    if (isExtensionContextValidQuiet()) {
      await chrome.storage.local.set({ lastScriptActivity: Date.now() });
    }
  } catch (error) {
    debugLog("Failed to update script activity timestamp", error, false);
  }
}

async function attemptScriptRecovery() {
  try {
    debugLogInfo(
      "Attempting script recovery after unexpected stop",
      { timestamp: new Date().toISOString() },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );

    const storage = await chrome.storage.local.get([
      "autoApplyRunning",
      "lastScriptActivity",
      "shouldRestartScript",
      "loopRestartUrl",
    ]);

    const now = Date.now();
    const timeSinceLastActivity = now - (storage.lastScriptActivity || 0);
    const isOnJobSearchPage = window.location.href.includes("/jobs/search/");

    if (
      timeSinceLastActivity < 60000 &&
      isOnJobSearchPage &&
      storage.shouldRestartScript
    ) {
      debugLogInfo(
        "Recovery conditions met - restarting script",
        chrome.runtime?.id
          ? {
              timeSinceLastActivity,
              isOnJobSearchPage: isOnJobSearchPage ?? null,
              shouldRestart: storage?.shouldRestartScript ?? null,
            }
          : null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );

      await chrome.storage.local.remove([
        "shouldRestartScript",
        "loopRestartUrl",
      ]);

      setTimeout(async () => {
        const started = await startScript();
        if (started) {
          runScript();
        }
      }, 2000);

      return true;
    }

    return false;
  } catch (error) {
    debugLogError(
      "Error during script recovery attempt",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    return false;
  }
}

async function setAutoApplyRunning(value, reason = "Unknown") {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  try {
    if (!isExtensionContextValidQuiet()) {
      return;
    }

    await chrome.storage.local.set({
      autoApplyRunning: value,
      lastScriptActivity: Date.now(),
    });

    if (!isExtensionContextValidQuiet()) {
      return;
    }

    debugLogInfo(
      `autoApplyRunning state changed to: ${value}`,
      {
        reason: reason,
        timestamp: new Date().toISOString(),
        newValue: value,
        lastActivity: Date.now(),
      },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  } catch (error) {
    if (isExtensionContextValidQuiet()) {
      debugLogError(
        `Failed to set autoApplyRunning to ${value}`,
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }
  }
}

async function stopScript() {
  debugLogCritical(
    "stopScript called - script stopping",
    {
      reason: "Manual stop or error",
      timestamp: new Date().toISOString(),
    },
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );

  stopExtensionContextMonitoring();

  const modalWrapper = document.getElementById("scriptRunningOverlay");
  if (modalWrapper) {
    modalWrapper.style.display = "none";
  }

  await setAutoApplyRunning(false, "stopScript called");
  await chrome.storage.local.remove(["loopRestartUrl", "shouldRestartScript"]);

  try {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== "function") {
      debugLogError(
        "Chrome tabs API not available in stopScript",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      prevSearchValue = "";
      return;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs?.length > 0) {
      const currentTabId = tabs?.[0].id;
      await chrome.runtime.sendMessage({
        action: "stopAutoApply",
        tabId: currentTabId,
      });
    }
  } catch (error) {
    debugLogError(
      "Error in stopScript",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  }
  prevSearchValue = "";
}

async function startScript() {
  if (!isExtensionContextValid()) {
    debugLogError(
      "Extension context invalid in startScript, cannot start",
      null,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    return false;
  }

  try {
    saveModalDetectedTime = 0;
    saveModalFailureCount = 0;

    await chrome.runtime.sendMessage({ action: "autoApplyRunning" });
    await setAutoApplyRunning(true, "startScript called");

    startExtensionContextMonitoring();

    return true;
  } catch (error) {
    debugLogError(
      "Error in startScript",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    return false;
  }
}

async function checkAndPrepareRunState(allowAutoRecovery = false) {
  return new Promise(async (resolve) => {
    try {
      const result = await chrome.storage.local.get("autoApplyRunning");
      const isRunning = result && result.autoApplyRunning;

      if (isRunning) {
        resolve(true);
      } else {
        if (allowAutoRecovery) {
          const lastActivity = await chrome.storage.local.get(
            "lastScriptActivity"
          );
          const now = Date.now();
          const timeSinceLastActivity =
            now - (lastActivity?.lastScriptActivity || 0);

          if (timeSinceLastActivity < 30000) {
            debugLogInfo(
              "checkAndPrepareRunState: script was recently active, attempting auto-recovery",
              {
                timeSinceLastActivity,
                attempting: "auto-recovery",
                storageResult: result,
                timestamp: new Date().toISOString(),
              },
              Array.from(
                new Set(
                  new Error().stack
                    .replace(/Error/g, "")
                    .match(/^\s*at.*$/gm)
                    .map((i) => i.trim())
                )
              ).join("\n")
            );

            await setAutoApplyRunning(
              true,
              "auto-recovery from recent activity"
            );
            resolve(true);
            return;
          }
        }

        debugLogCritical(
          "checkAndPrepareRunState: script not running, stopping process",
          {
            calledFrom: Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n"),
            storageResult: result,
            allowAutoRecovery,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            readyState: document.readyState,
          },
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
        resolve(false);
        prevSearchValue = "";
      }
    } catch (error) {
      debugLogError(
        "checkAndPrepareRunState: error during state check",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      resolve(false);
    }
  });
}

function getJobTitle(jobNameLink) {
  if (!jobNameLink) return "";
  let jobTitle = "";

  const visibleSpan = jobNameLink.querySelector('span[aria-hidden="true"]');
  if (visibleSpan && visibleSpan.textContent.trim().length > 0) {
    jobTitle = visibleSpan.textContent.trim();
  } else {
    jobTitle = jobNameLink.getAttribute("aria-label") || "";
    if (!jobTitle) {
      console.trace("Job title not found using both selectors");
    }
  }
  return jobTitle.toLowerCase();
}

async function clickDoneIfExist() {
  try {
    const modalWait = await waitForElements({
      elementOrSelector: ".artdeco-modal",
      timeout: 500,
    });
    const modal = modalWait?.[0];
    if (modal) {
      const xpathResult = getElementsByXPath({
        context: modal,
        xpath:
          '//button[.//*[contains(text(), "Done")] or contains(normalize-space(.), "Done")]',
      });
      if (xpathResult && xpathResult.length > 0) {
        const doneButton = xpathResult[0];
        await clickElement({ elementOrSelector: doneButton });
        await addDelay(300);
      }
    }
  } catch (error) {
    console.trace("clickDoneIfExist error:" + error?.message);
  }
}

async function clickJob(listItem, companyName, jobTitle, badWordsEnabled) {
  return new Promise(async (resolve) => {
    try {
      await updateScriptActivity();

      const isRunning = await checkAndPrepareRunState();
      if (!isRunning) {
        debugLogCritical(
          "clickJob: script not running, aborting job processing",
          null,
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
        resolve(null);
        return;
      }

      if (badWordsEnabled) {
        const jobDetailsElement = document.querySelector(
          '[class*="jobs-box__html-content"]'
        );
        if (jobDetailsElement) {
          const jobContentText = jobDetailsElement.textContent
            .toLowerCase()
            .trim();
          const response = await chrome.storage.local.get(["badWords"]);
          const badWords = response?.badWords;
          if (badWords?.length > 0) {
            let matchedBadWord = null;
            for (const badWord of badWords) {
              const regex = new RegExp(
                "\\b" + badWord.trim().replace(/\+/g, "\\+") + "\\b",
                "i"
              );
              if (regex.test(jobContentText)) {
                matchedBadWord = badWord;
                break;
              }
            }
            if (matchedBadWord) {
              debugLogInfo(
                `clickJob: found bad word "${matchedBadWord}", skipping job`,
                {
                  url: window.location.href,
                  companyName,
                  jobTitle,
                  matchedBadWord,
                },
                Array.from(
                  new Set(
                    new Error().stack
                      .replace(/Error/g, "")
                      .match(/^\s*at.*$/gm)
                      .map((i) => i.trim())
                  )
                ).join("\n")
              );
              resolve(null);
              return;
            }
          }
        }
      }

      await runFindEasyApply(jobTitle, companyName);
      resolve(null);
    } catch (error) {
      debugLogError(
        "Error in clickJob",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      resolve(null);
    }
  });
}

async function handleCheckboxField(inputField, labelText, jobUrl, jobTitle) {
  try {
    const checkboxLabel = labelText.toLowerCase();

    const agreementKeywords = [
      "terms",
      "conditions",
      "agree",
      "i agree",
      "terms & conditions",
      "terms and conditions",
      "privacy policy",
      "accept",
      "consent",
      "acknowledge",
      "confirm",
      "verified",
    ];

    const shouldCheck = agreementKeywords.some(
      (keyword) =>
        checkboxLabel.includes(keyword) ||
        checkboxLabel.includes(keyword.replace("&", "and"))
    );

    debugLogInfo(
      `Processing checkbox: "${labelText}"`,
      {
        jobUrl,
        jobTitle,
        checkboxLabel: labelText,
        shouldCheck,
        matchedKeywords: agreementKeywords.filter(
          (keyword) =>
            checkboxLabel.includes(keyword) ||
            checkboxLabel.includes(keyword.replace("&", "and"))
        ),
        inputId: inputField.id,
        currentlyChecked: inputField.checked,
      },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );

    if (shouldCheck && !inputField.checked) {
      inputField.scrollIntoView({ behavior: "smooth", block: "center" });
      await addDelay(200);

      inputField.checked = true;
      inputField.dispatchEvent(new Event("change", { bubbles: true }));
      inputField.dispatchEvent(new Event("click", { bubbles: true }));

      await addDelay(300);

      debugLogInfo(
        `Checkbox checked automatically: "${labelText}"`,
        {
          jobUrl,
          jobTitle,
          checkboxLabel: labelText,
          action: "checkbox_checked",
        },
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    } else if (!shouldCheck) {
      debugLogInfo(
        `Checkbox skipped (no matching keywords): "${labelText}"`,
        {
          jobUrl,
          jobTitle,
          checkboxLabel: labelText,
          action: "checkbox_skipped",
        },
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }
  } catch (error) {
    debugLogError(
      `Error handling checkbox: "${labelText}"`,
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  }
}

async function performInputFieldChecks(context = document) {
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getInputFieldConfig" }, resolve);
    });

    const jobUrl = window.location.href;
    const jobTitle =
      document.querySelector("[data-job-title]")?.textContent?.trim() ||
      document
        .querySelector(".job-details-jobs-unified-top-card__job-title")
        ?.textContent?.trim() ||
      "Unknown Job";

    const allInputFields = context.querySelectorAll(
      'input[type="text"]:not([placeholder*="Search"]):not([placeholder*="search"]), input[role="combobox"]:not([placeholder*="Search"]):not([placeholder*="search"]), textarea, select, input[type="checkbox"]'
    );

    for (const inputField of allInputFields) {
      if (inputField.type === "hidden" || inputField.offsetParent === null) {
        continue;
      }

      if (
        inputField.closest('[class*="search"]') ||
        inputField.closest('[class*="global-nav"]') ||
        inputField.closest('[class*="jobs-search-box"]') ||
        inputField.closest('[data-test="jobs-search-box"]') ||
        inputField.placeholder?.toLowerCase().includes("search") ||
        (inputField.placeholder?.toLowerCase().includes("company") &&
          inputField.placeholder?.toLowerCase().includes("title"))
      ) {
        continue;
      }

      let label = null;
      let labelText = "";

      if (inputField.id) {
        label = document.querySelector(`label[for="${inputField.id}"]`);
      }

      if (!label) {
        label = inputField.closest("label");
      }

      if (!label) {
        const container = inputField.closest("div, fieldset, section, form");
        if (container) {
          label = container.querySelector("label");
        }
      }

      if (!label && inputField.getAttribute("aria-labelledby")) {
        const labelId = inputField.getAttribute("aria-labelledby");
        label = document.getElementById(labelId);
      }

      if (!label && inputField.placeholder) {
        labelText = inputField.placeholder.trim();
      }

      if (!label && !labelText) {
        const container = inputField.closest("div, fieldset, section");
        if (container) {
          const textElements = container.querySelectorAll(
            'span[aria-hidden="true"], span:not(.visually-hidden), div, p, h1, h2, h3, h4, h5, h6'
          );
          for (const textEl of textElements) {
            const text = textEl.textContent?.trim();
            if (
              text &&
              text.length > 0 &&
              text.length < 200 &&
              !text.includes("http") &&
              !text.includes("data-")
            ) {
              labelText = text;
              break;
            }
          }
        }
      }

      if (label) {
        labelText = label.textContent?.trim() || label.innerText?.trim() || "";
      }

      if (labelText) {
        labelText = labelText.replace(/[*()]/g, "").trim();
      }

      if (!labelText || labelText.length < 2) {
        continue;
      }

      const isAutocompleteField = inputField.matches('[role="combobox"]');
      const container = inputField.closest("div, fieldset, section, form");
      const isNewTypeContainer =
        container?.hasAttribute(
          "data-test-single-typeahead-entity-form-component"
        ) || false;

      debugLogInfo(
        `Processing form field: "${labelText}"`,
        {
          jobUrl,
          jobTitle,
          isAutocomplete: isAutocompleteField,
          isNewType: isNewTypeContainer,
          inputType: inputField.type,
          inputRole: inputField.getAttribute("role"),
          inputId: inputField.id,
          containerClass: container?.className || "no-container",
          hasPlaceholder: !!inputField.placeholder,
          labelSource: label
            ? "label-element"
            : inputField.placeholder
            ? "placeholder"
            : "text-search",
        },
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );

      if (inputField.type === "checkbox") {
        await handleCheckboxField(inputField, labelText, jobUrl, jobTitle);
        continue;
      }
      const foundConfig = result.find(
        (config) => config.placeholderIncludes === labelText
      );
      if (foundConfig && foundConfig.defaultValue) {
        setNativeValue(inputField, foundConfig.defaultValue);
        await performFillForm(inputField);
      } else {
        const defaultFields = (await chrome.storage.local.get("defaultFields"))
          ?.defaultFields;
        if (defaultFields && Object.keys(defaultFields).length > 0) {
          const valueFromDefault = findClosestField(defaultFields, labelText);
          if (!valueFromDefault) {
            const inputFieldConfigsArray = (
              await chrome.storage.local.get("inputFieldConfigs")
            )?.inputFieldConfigs;
            if (
              inputFieldConfigsArray &&
              Array.isArray(inputFieldConfigsArray) &&
              inputFieldConfigsArray.length > 0
            ) {
              const inputFieldConfigsObj = inputFieldConfigsArray.reduce(
                (acc, { placeholderIncludes, defaultValue }) => {
                  return {
                    ...acc,
                    [placeholderIncludes]: defaultValue,
                  };
                },
                {}
              );
              const valueFromConfigs = findClosestField(
                inputFieldConfigsObj,
                labelText
              );
              if (valueFromConfigs) {
                debugLogInfo(
                  `Filling field from configs: "${labelText}" = "${valueFromConfigs}"`,
                  {
                    jobUrl,
                    jobTitle,
                    isAutocomplete: isAutocompleteField,
                    isNewType: isNewTypeContainer,
                    value: valueFromConfigs,
                  },
                  Array.from(
                    new Set(
                      new Error().stack
                        .replace(/Error/g, "")
                        .match(/^\s*at.*$/gm)
                        .map((i) => i.trim())
                    )
                  ).join("\n")
                );

                if (isAutocompleteField) {
                  await fillAutocompleteField(inputField, valueFromConfigs);
                } else {
                  setNativeValue(inputField, valueFromConfigs);
                }
              }
            }
          } else {
            debugLogInfo(
              `Filling field from defaults: "${labelText}" = "${valueFromDefault}"`,
              {
                jobUrl,
                jobTitle,
                isAutocomplete: isAutocompleteField,
                isNewType: isNewTypeContainer,
                value: valueFromDefault,
              },
              Array.from(
                new Set(
                  new Error().stack
                    .replace(/Error/g, "")
                    .match(/^\s*at.*$/gm)
                    .map((i) => i.trim())
                )
              ).join("\n")
            );

            if (isAutocompleteField) {
              await fillAutocompleteField(inputField, valueFromDefault);
            } else {
              setNativeValue(inputField, valueFromDefault);
            }
          }
        }
        if (!inputField.value) {
          debugLogInfo(
            `Saving new field to storage: "${labelText}"`,
            {
              jobUrl,
              jobTitle,
              isAutocomplete: isAutocompleteField,
              isNewType: isNewTypeContainer,
              action: "updateInputFieldConfigsInStorage",
            },
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );

          await chrome.runtime.sendMessage({
            action: "updateInputFieldConfigsInStorage",
            data: labelText,
          });
          const isStopScript = Boolean(
            (await chrome.storage.local.get("stopIfNotExistInFormControl"))
              ?.stopIfNotExistInFormControl
          );
          if (!isStopScript) {
            if (!foundConfig && inputField.value.trim() !== "") {
              continue;
            }
            setNativeValue(inputField, "");
            await performFillForm(inputField);
          } else {
            await stopScript();
            alert(
              `Field with label "${labelText}" is not filled. Please fill it in the form control settings.`
            );
            return;
          }
        }
      }
    }
  } catch (error) {
    console.trace("performInputField not completed: " + error?.message);
  }
}

async function performFillForm(inputField) {
  const keyEvents = ["keydown", "keypress", "input", "keyup"];
  for (const eventType of keyEvents) {
    inputField.dispatchEvent(
      new Event(eventType, { bubbles: true, cancelable: true })
    );
    await addDelay(100);
  }

  inputField.dispatchEvent(new Event("change", { bubbles: true }));
  await addDelay(200);
}

async function performRadioButtonChecks() {
  const storedRadioButtons = await new Promise((resolve) => {
    chrome.storage.local.get("radioButtons", (result) => {
      resolve(result.radioButtons || []);
    });
  });

  const radioFieldsets = document.querySelectorAll(
    'fieldset[data-test-form-builder-radio-button-form-component="true"]'
  );

  for (const fieldset of radioFieldsets) {
    const legendElement = fieldset.querySelector("legend");
    const questionTextElement = legendElement.querySelector(
      'span[aria-hidden="true"]'
    );
    const placeholderText =
      questionTextElement?.textContent.trim() ||
      legendElement.textContent.trim();

    const storedRadioButtonInfo = storedRadioButtons.find(
      (info) => info.placeholderIncludes === placeholderText
    );

    if (storedRadioButtonInfo) {
      const radioButtonWithValue = fieldset.querySelector(
        `input[type="radio"][value="${storedRadioButtonInfo.defaultValue}"]`
      );

      if (radioButtonWithValue) {
        radioButtonWithValue.checked = true;
        radioButtonWithValue.dispatchEvent(
          new Event("change", { bubbles: true })
        );
        await addDelay(500);
      }

      storedRadioButtonInfo.count++;
      if (
        !("createdAt" in storedRadioButtonInfo) ||
        !storedRadioButtonInfo.createdAt
      ) {
        storedRadioButtonInfo.createdAt = Date.now();
      }
    } else {
      const firstRadioButton = fieldset.querySelector('input[type="radio"]');
      if (firstRadioButton) {
        firstRadioButton.checked = true;
        firstRadioButton.dispatchEvent(new Event("change", { bubbles: true }));
        await addDelay(500);

        const options = Array.from(
          fieldset.querySelectorAll('input[type="radio"]')
        ).map((radioButton) => {
          const labelElement = fieldset.querySelector(
            `label[for="${radioButton.id}"]`
          );
          let text = labelElement?.textContent.trim();

          if (!text) {
            const parentElement = radioButton.parentElement;
            const textElement =
              parentElement?.querySelector("span") ||
              parentElement?.querySelector("div");
            text = textElement?.textContent?.trim() || radioButton.value;
          }

          return {
            value: radioButton.value,
            text: text,
            selected: radioButton.checked,
          };
        });

        const newRadioButtonInfo = {
          placeholderIncludes: placeholderText,
          defaultValue: firstRadioButton.value,
          count: 1,
          options: options,
          createdAt: Date.now(),
        };

        storedRadioButtons.push(newRadioButtonInfo);

        await chrome.storage.local.set({ radioButtons: storedRadioButtons });
      }
      const isStopScript = Boolean(
        (await chrome.storage.local.get("stopIfNotExistInFormControl"))
          ?.stopIfNotExistInFormControl
      );
      if (isStopScript) {
        await stopScript();
        alert(
          `Field with label "${placeholderText}" is not filled. Please fill it in the form control settings.`
        );
        return;
      }
    }
  }

  await chrome.storage.local.set({ radioButtons: storedRadioButtons });
}

async function performDropdownChecks() {
  const storedDropdowns = await new Promise((resolve) => {
    chrome.storage.local.get("dropdowns", (result) => {
      resolve(result.dropdowns || []);
    });
  });

  const dropdowns = document.querySelectorAll(".fb-dash-form-element select");
  dropdowns.forEach((dropdown, index) => {
    const parentElement = dropdown.closest(".fb-dash-form-element");
    if (parentElement) {
      const labelElement = parentElement.querySelector("label");
      let labelText = null;

      if (labelElement) {
        const ariaHiddenSpan = labelElement.querySelector(
          'span[aria-hidden="true"]'
        );
        labelText = ariaHiddenSpan?.textContent.trim();

        if (!labelText) {
          labelText = labelElement.innerText.trim();
        }
      }

      labelText = labelText || `Dropdown ${index}`;

      const secondOption = dropdown.options[1];
      if (secondOption && dropdown.selectedIndex < 1) {
        secondOption.selected = true;
        dropdown.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const options = Array.from(dropdown.options).map((option) => ({
        value: option.value,
        text: option.textContent.trim(),
        selected: option.selected,
      }));

      const storedDropdownInfo = storedDropdowns.find(
        (info) => info.placeholderIncludes === labelText
      );

      if (storedDropdownInfo) {
        const selectedValue = storedDropdownInfo.options.find(
          (option) => option.selected
        )?.value;

        Array.from(dropdown.options).forEach((option) => {
          option.selected = option.value === selectedValue;
        });

        dropdown.dispatchEvent(new Event("change", { bubbles: true }));

        storedDropdownInfo.count++;
      } else {
        const newDropdownInfo = {
          placeholderIncludes: labelText,
          count: 1,
          options: options.map((option) => ({
            value: option.value,
            text: option.text,
            selected: option.selected,
          })),
        };

        storedDropdowns.push(newDropdownInfo);
      }
    }
  });

  void chrome.storage.local.set({ dropdowns: storedDropdowns });
}

async function performCheckBoxFieldCityCheck() {
  const checkboxFieldsets = document.querySelectorAll(
    'fieldset[data-test-checkbox-form-component="true"]'
  );
  for (const fieldset of checkboxFieldsets) {
    const firstCheckbox = fieldset.querySelector('input[type="checkbox"]');
    if (firstCheckbox) {
      firstCheckbox.checked = true;
      firstCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await addDelay(500);
    }
  }
}

async function performSafetyReminderCheck() {
  const modal = document.querySelector(".artdeco-modal");
  if (modal) {
    const modalHeader = modal.querySelector(".artdeco-modal__header");
    if (
      modalHeader &&
      modalHeader.textContent.includes("Job search safety reminder")
    ) {
      const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
      if (dismissButton) {
        dismissButton.click();
      }
    }
  }
}

async function validateAndCloseConfirmationModal() {
  const modal = document.querySelector(".artdeco-modal");
  if (modal) {
    const modalHeader = modal.querySelector(".artdeco-modal__header");
    const modalContent = modal.querySelector(".artdeco-modal__content");

    if (
      (modalHeader &&
        modalHeader.textContent.includes("Save this application?")) ||
      (modalContent &&
        modalContent.textContent.includes(
          "Save to return to this application later"
        ))
    ) {
      const discardButton = modal.querySelector(
        "button[data-test-dialog-secondary-btn]"
      );
      if (
        discardButton &&
        discardButton.textContent.trim().includes("Discard")
      ) {
        discardButton.click();
        await addDelay(1000);
        return true;
      }

      const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
      if (dismissButton) {
        dismissButton.click();
        await addDelay(1000);
        return true;
      }

      debugLogError(
        "Save application modal found but no buttons to close it",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }
  }

  return false;
}

async function handleSaveApplicationModal() {
  const currentTime = Date.now();

  if (isSaveModalBeingHandled) {
    debugLog("Save modal already being handled, skipping duplicate call");
    return false;
  }

  if (currentTime - lastSaveModalHandleTime < 2000) {
    return false;
  }

  const saveModal = document.querySelector(
    '[data-test-modal=""][role="alertdialog"]'
  );

  if (!saveModal) {
    return false;
  }

  const titleElement = saveModal.querySelector("h2[data-test-dialog-title]");
  if (
    !titleElement ||
    !titleElement.textContent.includes("Save this application?")
  ) {
    return false;
  }

  isSaveModalBeingHandled = true;
  lastSaveModalHandleTime = currentTime;

  if (saveModalDetectedTime === 0) {
    saveModalDetectedTime = currentTime;
    saveModalFailureCount = 0;
  }

  const waitTime = currentTime - saveModalDetectedTime;
  if (waitTime > MAX_SAVE_MODAL_WAIT_TIME) {
    debugLogCritical(
      "Save modal has been stuck for too long - stopping script",
      {
        waitTime,
        maxWaitTime: MAX_SAVE_MODAL_WAIT_TIME,
        failureCount: saveModalFailureCount,
      }
    );
    await stopScript();
    return false;
  }

  if (saveModalFailureCount >= MAX_SAVE_MODAL_FAILURES) {
    debugLogCritical(
      "Too many save modal handling failures - stopping script",
      {
        failureCount: saveModalFailureCount,
        maxFailures: MAX_SAVE_MODAL_FAILURES,
        waitTime,
      }
    );
    await stopScript();
    return false;
  }

  try {
    const jobUrl = window.location.href;
    const jobTitle =
      document.querySelector("[data-job-title]")?.textContent?.trim() ||
      document
        .querySelector(".job-details-jobs-unified-top-card__job-title")
        ?.textContent?.trim() ||
      "Unknown Job";

    debugLogCritical("Save application modal detected - attempting to handle", {
      jobUrl,
      jobTitle,
      modalVisible: saveModal.style.display !== "none",
      timestamp: new Date().toISOString(),
      waitTime,
      failureCount: saveModalFailureCount,
    });

    const discardButton = saveModal.querySelector(
      "button[data-test-dialog-secondary-btn]"
    );
    if (
      discardButton &&
      discardButton.textContent.trim().toLowerCase().includes("discard")
    ) {
      debugLogInfo("Clicking Discard button to close save modal", {
        jobUrl,
        jobTitle,
        buttonText: discardButton.textContent.trim(),
      });

      discardButton.click();
      await addDelay(1500);

      const modalStillExists = document.querySelector(
        '[data-test-modal=""][role="alertdialog"]'
      );
      if (!modalStillExists) {
        debugLogInfo("Save modal successfully closed with Discard button", {
          jobUrl,
          jobTitle,
        });
        saveModalDetectedTime = 0;
        saveModalFailureCount = 0;
        return true;
      } else {
        debugLogError("Save modal still exists after Discard click", {
          jobUrl,
          jobTitle,
        });
        saveModalFailureCount++;
      }
    }

    const dismissButton = saveModal.querySelector(
      'button[aria-label="Dismiss"]'
    );
    if (dismissButton) {
      debugLogError("No Discard button found, using Dismiss as fallback", {
        jobUrl,
        jobTitle,
        availableButtons: Array.from(saveModal.querySelectorAll("button")).map(
          (b) => b.textContent.trim()
        ),
      });

      dismissButton.click();
      await addDelay(1500);

      const modalStillExists = document.querySelector(
        '[data-test-modal=""][role="alertdialog"]'
      );
      if (!modalStillExists) {
        debugLogInfo("Save modal successfully closed with Dismiss button", {
          jobUrl,
          jobTitle,
        });
        saveModalDetectedTime = 0;
        saveModalFailureCount = 0;
        return true;
      } else {
        debugLogError("Save modal still exists after Dismiss click", {
          jobUrl,
          jobTitle,
        });
        saveModalFailureCount++;
      }
    }

    debugLogError("Save modal found but no way to close it", {
      jobUrl,
      jobTitle,
      modalHTML: saveModal.outerHTML.substring(0, 500),
      availableButtons: Array.from(saveModal.querySelectorAll("button")).map(
        (b) => ({
          text: b.textContent.trim(),
          ariaLabel: b.getAttribute("aria-label"),
          dataTest: b.getAttribute("data-test-dialog-secondary-btn"),
        })
      ),
    });

    saveModalFailureCount++;
    return false;
  } catch (error) {
    debugLogError("Error in handleSaveApplicationModal", error);
    saveModalFailureCount++;
    return false;
  } finally {
    setTimeout(() => {
      isSaveModalBeingHandled = false;
    }, 1000);
  }
}

function checkIfAlreadyApplied(textContent) {
  const lowerText = textContent.toLowerCase();
  return (
    lowerText.includes("applied") &&
    (lowerText.includes("ago") ||
      lowerText.includes("minutes") ||
      lowerText.includes("hours") ||
      lowerText.includes("days"))
  );
}

async function checkForFormValidationError() {
  const feedbackMessageElement = document.querySelector(
    ".artdeco-inline-feedback__message"
  );

  if (!feedbackMessageElement) {
    return false;
  }

  const textContent = feedbackMessageElement.textContent;

  if (checkIfAlreadyApplied(textContent)) {
    return false;
  }

  if (
    textContent.toLowerCase().includes("exceeded") &&
    textContent.toLowerCase().includes("limit")
  ) {
    return false;
  }

  const validationErrors = [
    "required",
    "must",
    "invalid",
    "error",
    "cannot",
    "please",
    "field",
  ];

  return validationErrors.some((error) =>
    textContent.toLowerCase().includes(error)
  );
}

async function terminateJobModel(context = document) {
  if (!isSaveModalBeingHandled) {
    const saveModalHandled = await handleSaveApplicationModal();
    if (saveModalHandled) {
      debugLogInfo("terminateJobModel: save modal handled, exiting");
      return;
    }
  }

  const dismissButton = context.querySelector('button[aria-label="Dismiss"]');
  if (dismissButton) {
    debugLogInfo("terminateJobModel: clicking dismiss button");
    dismissButton.click();
    dismissButton.dispatchEvent(new Event("change", { bubbles: true }));
    await addDelay(1000);

    if (!isSaveModalBeingHandled) {
      const saveModalAfterDismiss = await handleSaveApplicationModal();
      if (saveModalAfterDismiss) {
        debugLogInfo("terminateJobModel: save modal handled after dismiss");
        return;
      }
    }

    const discardButton = Array.from(
      document.querySelectorAll("button[data-test-dialog-secondary-btn]")
    ).find((button) => button.textContent.trim() === "Discard");
    if (discardButton) {
      debugLogInfo("terminateJobModel: clicking separate discard button");
      discardButton.click();
      discardButton.dispatchEvent(new Event("change", { bubbles: true }));
      await addDelay(500);
    }
  } else {
    debugLogError("terminateJobModel: no dismiss button found", {
      availableButtons: Array.from(context.querySelectorAll("button")).map(
        (b) => ({
          text: b.textContent.trim(),
          ariaLabel: b.getAttribute("aria-label"),
        })
      ),
    });
  }
}

async function performUniversalCheckboxChecks(context = document) {
  try {
    const jobUrl = window.location.href;
    const jobTitle =
      document.querySelector("[data-job-title]")?.textContent?.trim() ||
      document
        .querySelector(".job-details-jobs-unified-top-card__job-title")
        ?.textContent?.trim() ||
      "Unknown Job";

    const checkboxSelectors = [
      'input[type="checkbox"]',
      '[data-test-text-selectable-option] input[type="checkbox"]',
      "[data-test-text-selectable-option__input]",
    ];

    let allCheckboxes = [];
    for (const selector of checkboxSelectors) {
      const checkboxes = context.querySelectorAll(selector);
      allCheckboxes.push(...Array.from(checkboxes));
    }

    allCheckboxes = [...new Set(allCheckboxes)];

    debugLogInfo(
      `Found ${allCheckboxes.length} checkboxes in form`,
      {
        jobUrl,
        jobTitle,
        checkboxCount: allCheckboxes.length,
        selectors: checkboxSelectors,
      },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );

    for (const checkbox of allCheckboxes) {
      if (checkbox.type !== "checkbox") continue;

      let labelText = "";

      if (checkbox.id) {
        const label = context.querySelector(`label[for="${checkbox.id}"]`);
        if (label) {
          labelText = label.textContent?.trim() || "";
        }
      }

      if (!labelText) {
        const dataTestLabel = checkbox.getAttribute(
          "data-test-text-selectable-option__input"
        );
        if (dataTestLabel) {
          labelText = dataTestLabel.replace(/&amp;/g, "&").trim();
        }
      }

      if (!labelText) {
        const closestLabel = checkbox
          .closest("div, span, fieldset")
          ?.querySelector("label");
        if (closestLabel) {
          labelText = closestLabel.textContent?.trim() || "";
        }
      }

      if (!labelText) {
        labelText = checkbox.getAttribute("aria-label") || "";
      }

      if (!labelText) {
        const container = checkbox.closest("div, span, fieldset");
        if (container) {
          const textNodes = container.querySelectorAll("span, div, label, p");
          for (const node of textNodes) {
            const text = node.textContent?.trim();
            if (text && text.length > 2 && text.length < 200) {
              labelText = text;
              break;
            }
          }
        }
      }

      if (labelText && labelText.length > 1) {
        await handleCheckboxField(checkbox, labelText, jobUrl, jobTitle);
      }
    }
  } catch (error) {
    debugLogError(
      "Error in performUniversalCheckboxChecks",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  }
}

async function runValidations() {
	// TODO: ch
	try {
		const saveModalHandled = await handleSaveApplicationModal();
		if (saveModalHandled) {
			return;
		}
		
		await validateAndCloseConfirmationModal();
		
		const applyModal = document.querySelector(".artdeco-modal") || document;
		await performInputFieldChecks(applyModal);
		await performUniversalCheckboxChecks(applyModal);
		await performRadioButtonChecks();
		await performDropdownChecks();
		await performCheckBoxFieldCityCheck();
		
		await handleSaveApplicationModal();
	} catch {}
}

async function uncheckFollowCompany() {
  const followCheckboxWait = await waitForElements({
    elementOrSelector: "#follow-company-checkbox",
    timeout: 3000,
  });

  const followCheckbox = followCheckboxWait?.[0];
  if (followCheckbox?.checked) {
    followCheckbox?.scrollIntoView({ block: "center" });
    await addDelay(300);
    followCheckbox.checked = false;
    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    followCheckbox.dispatchEvent(changeEvent);
    await addDelay(200);
  }
}

async function runApplyModel() {
  try {
    return await Promise.race([
      new Promise(async (resolve) => {
        await addDelay();
        await performSafetyReminderCheck();

        const saveModalHandled = await handleSaveApplicationModal();
        if (saveModalHandled) {
          resolve(null);
          return;
        }

        const applyModalWait = await waitForElements({
          elementOrSelector: ".artdeco-modal",
          timeout: 3000,
        });

        if (Array.isArray(applyModalWait)) {
          const applyModal = applyModalWait[0];

          const continueApplyingButton = applyModal?.querySelector(
            'button[aria-label="Continue applying"]'
          );

          if (continueApplyingButton) {
            continueApplyingButton?.scrollIntoView({ block: "center" });
            await addDelay(300);
            continueApplyingButton.click();
            await runApplyModel();
          }

          const nextButton =
            applyModal?.querySelectorAll &&
            Array.from(applyModal.querySelectorAll("button")).find((button) =>
              button.textContent.includes("Next")
            );
          const reviewButtonWait = await waitForElements({
            elementOrSelector: 'button[aria-label="Review your application"]',
            timeout: 2000,
          });
          const reviewButton = reviewButtonWait?.[0];
          const submitButtonWait = await waitForElements({
            elementOrSelector: 'button[aria-label="Submit application"]',
            timeout: 2000,
          });
          const submitButton = submitButtonWait?.[0];

          if (submitButton) {
            await uncheckFollowCompany();
            submitButton?.scrollIntoView({ block: "center" });
            await addDelay(300);

            const isStillRunning = await checkAndPrepareRunState();
            if (!isStillRunning) {
              return;
            }

            submitButton.click();
            await addDelay(2000);

            const saveModalAfterSubmit = await handleSaveApplicationModal();
            if (saveModalAfterSubmit) {
              debugLog(
                "Save application modal handled after submit",
                null,
                false,
                Array.from(
                  new Set(
                    new Error().stack
                      .replace(/Error/g, "")
                      .match(/^\s*at.*$/gm)
                      .map((i) => i.trim())
                  )
                ).join("\n")
              );
            }

            const isStillRunning2 = await checkAndPrepareRunState();
            if (!isStillRunning2) {
              return;
            }

            const modalCloseButton = document.querySelector(
              ".artdeco-modal__dismiss"
            );
            if (modalCloseButton) {
              modalCloseButton?.scrollIntoView({ block: "center" });
              await addDelay(300);
              modalCloseButton.click();
            }
            await clickDoneIfExist();
          }

          if (nextButton || reviewButton) {
            const buttonToClick = reviewButton || nextButton;
            await runValidations();
            const isError = await checkForFormValidationError();

            if (isError) {
              debugLogError(
                "Form validation error detected, terminating job modal",
                null,
                Array.from(
                  new Set(
                    new Error().stack
                      .replace(/Error/g, "")
                      .match(/^\s*at.*$/gm)
                      .map((i) => i.trim())
                  )
                ).join("\n")
              );
              await terminateJobModel();
            } else {
              buttonToClick?.scrollIntoView({ block: "center" });
              await addDelay();
              buttonToClick.click();

              await addDelay(1000);
              const saveModalAfterNext = await handleSaveApplicationModal();
              if (saveModalAfterNext) {
                debugLog(
                  "Save application modal handled after next/review",
                  null,
                  false,
                  Array.from(
                    new Set(
                      new Error().stack
                        .replace(/Error/g, "")
                        .match(/^\s*at.*$/gm)
                        .map((i) => i.trim())
                    )
                  ).join("\n")
                );
              }

              await runApplyModel();
            }

            if (
              document
                ?.querySelector("button[data-test-dialog-secondary-btn]")
                ?.innerText.includes("Discard")
            ) {
              await terminateJobModel();
              resolve(null);
            }
          }
        }

        await handleSaveApplicationModal();

        if (!document?.querySelector(".artdeco-modal")) {
          resolve(null);
        } else {
          const modalsToClose = Array.from(
            document.querySelectorAll(".artdeco-modal")
          );
          for (const modal of modalsToClose) {
            await addDelay(1000);
            await terminateJobModel(modal);
          }
        }
        await addDelay(1000);
        return new Promise((resolve) => {
          const artdecoModal = document.querySelector(
            '[class*="artdeco-modal"]'
          );
          if (artdecoModal) {
            const buttons = artdecoModal.querySelectorAll("button");
            for (const button of buttons) {
              if (
                "textContent" in button &&
                button?.textContent?.trim()?.includes("No thanks")
              ) {
                button.click();
                resolve(null);
                break;
              }
            }
            resolve(null);
          }
        }).catch(() => resolve(null));
      }),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 30000);
      }),
    ]);
  } catch (error) {
    debugLogError(
      "runApplyModel critical error",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  }
}

async function runFindEasyApply(jobTitle, companyName) {
  return new Promise(async (resolve) => {
    try {
      await addDelay(1000);

      const saveModalHandled = await handleSaveApplicationModal();
      if (saveModalHandled) {
        resolve(null);
        return;
      }

      const alreadyAppliedElement = document.querySelector(
        ".artdeco-inline-feedback__message"
      );
      if (alreadyAppliedElement) {
        const textContent = alreadyAppliedElement.textContent;
        if (checkIfAlreadyApplied(textContent)) {
          debugLogInfo(
            `Already applied to job: ${jobTitle} at ${companyName}`,
            null,
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
          resolve(null);
          return;
        }
      }

      const currentPageLink = window.location.href;

      if (!chrome || !chrome.runtime) {
        debugLogError(
          "Extension context invalidated in runFindEasyApply",
          null,
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
        resolve(null);
        return;
      }

      const externalApplyElements = getElementsByXPath({
        xpath: not_easy_apply_button,
      });

      if (externalApplyElements.length > 0) {
        await chrome.runtime.sendMessage({
          action: "externalApplyAction",
          data: { jobTitle, currentPageLink, companyName },
        });
      }

      const easyApplyElements = getElementsByXPath({
        xpath: easy_apply_button,
      });

      if (easyApplyElements.length > 0) {
        const buttonPromises = Array.from(easyApplyElements).map(
          async (button) => {
            return await new Promise((resolve) => {
              checkAndPrepareRunState().then((result) => {
                if (!result) {
                  resolve(null);
                  return;
                }
                button.click();
                resolve(runApplyModel());
              });
            });
          }
        );
        await Promise.race(buttonPromises);
      }

      await handleSaveApplicationModal();

      resolve(null);
    } catch (error) {
      debugLogError(
        "Error in runFindEasyApply",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      resolve(null);
    }
  });
}

let currentPage = "";

function toggleBlinkingBorder(element) {
  let count = 0;
  const intervalId = setInterval(() => {
    element.style.border = count % 2 === 0 ? "2px solid red" : "none";
    count++;
    if (count === 10) {
      clearInterval(intervalId);
      element.style.border = "none";
    }
  }, 500);
}

async function checkLimitReached() {
  return new Promise((resolve) => {
    const feedbackMessageElement = document.querySelector(
      ".artdeco-inline-feedback__message"
    );

    if (feedbackMessageElement) {
      const textContent = feedbackMessageElement.textContent;

      const searchString = "You've exceeded the daily application limit";

      resolve(textContent.includes(searchString));
    } else {
      resolve(false);
    }
  });
}

function isChromeStorageAvailable() {
  return (
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
  );
}

async function checkAndPromptFields() {
  try {
    if (!isChromeStorageAvailable()) {
      return false;
    }
    const response = await chrome.storage.local.get("defaultFields");
    return response?.defaultFields;
  } catch (error) {
    console.trace("Error in checkAndPromptFields: " + error?.message);
    return false;
  }
}

async function fillSearchFieldIfEmpty() {
  if (!(await checkAndPrepareRunState())) return;
  const inputElement = document?.querySelector(
    '[id*="jobs-search-box-keyword"]'
  );
  if (prevSearchValue && inputElement) {
    if (!inputElement.value.trim()) {
      inputElement.focus();
      await addDelay(2000);
      inputElement.value = prevSearchValue;
      const inputEvent = new Event("input", { bubbles: true });
      await addDelay(100);
      inputElement.dispatchEvent(inputEvent);
      await addDelay(100);
      const changeEvent = new Event("change", { bubbles: true });
      await addDelay(100);
      inputElement.dispatchEvent(changeEvent);
      await addDelay(100);
      const lists = document?.querySelectorAll(
        '[class*="typeahead-results"] > li'
      );
      if (lists) {
        for (const list of lists) {
          if ("click" in list) {
            list.click();
          }
        }
      }
    }
  }
}

async function closeApplicationSentModal() {
  const saveModalHandled = await handleSaveApplicationModal();
  if (saveModalHandled) {
    return;
  }

  const modal = document.querySelector(".artdeco-modal");

  if (
    modal?.textContent.includes("Application sent") &&
    modal.textContent.includes("Your application was sent to")
  ) {
    modal.querySelector(".artdeco-modal__dismiss")?.click();
    await addDelay(500);
  }
}

let isNavigating = false;

async function handleLoopRestart() {
  debugLogInfo(
    "handleLoopRestart called",
    null,
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );
  try {
    const { lastJobSearchUrl, loopRunningDelay } =
      await chrome.storage.local.get(["lastJobSearchUrl", "loopRunningDelay"]);

    const delayInMs = (loopRunningDelay || 0) * 60 * 1000;

    if (delayInMs > 0) {
      await addDelay(delayInMs);
    }

    const urlToUse = lastJobSearchUrl || window.location.href;
    const url = new URL(urlToUse);
    url.searchParams.set("start", "1");

    const baseSearchParams = new URLSearchParams();
    const importantParams = [
      "keywords",
      "geoId",
      "f_TPR",
      "sortBy",
      "origin",
      "refresh",
    ];

    importantParams.forEach((param) => {
      if (url.searchParams.has(param)) {
        baseSearchParams.set(param, url.searchParams.get(param));
      }
    });
    baseSearchParams.set("start", "1");

    const newUrl = `${url.origin}${
      url.pathname
    }?${baseSearchParams.toString()}`;

    if (chrome.runtime?.id) {
      await chrome.storage.local.set({
        loopRestartUrl: newUrl,
        shouldRestartScript: true,
      });
    }

    window.location.href = newUrl;
  } catch (error) {
    debugLogError(
      "Error in handleLoopRestart",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    void stopScript();
  }
}

async function goToNextPage() {
  await addDelay();
  if (isNavigating) {
    return false;
  }

  isNavigating = true;

  try {
    const isStillRunning = await checkAndPrepareRunState();
    if (!isStillRunning) {
      isNavigating = false;
      return false;
    }

    const pagination = document?.querySelector(".jobs-search-pagination");
    const paginationPage = pagination?.querySelector(
      ".jobs-search-pagination__indicator-button--active"
    )?.innerText;
    const nextButton = pagination?.querySelector("button[aria-label*='next']");

    if (!nextButton) {
      isNavigating = false;
      const { loopRunning } = await chrome.storage.local.get("loopRunning");
      if (loopRunning) {
        await handleLoopRestart();
      } else {
        stopScript();
      }
      return false;
    }

    nextButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await addDelay(1000);
    nextButton.click();

    try {
      await waitForElements({
        elementOrSelector: ".scaffold-layout__list-item",
        timeout: 5000,
      });
    } catch (error) {
      debugLogError(
        "goToNextPage waitForElements error",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }

    await addDelay(1000);
    const scrollElement = document?.querySelector(
      ".scaffold-layout__list > div"
    );
    if (scrollElement) {
      scrollElement?.scrollTo({
        top: scrollElement.scrollHeight,
      });
    }

    await new Promise((resolve) => {
      const checkPageLoaded = () => {
        if (document.readyState === "complete") {
          resolve();
        } else {
          setTimeout(checkPageLoaded, 500);
        }
      };
      checkPageLoaded();
    });

    currentPage = paginationPage;
    isNavigating = false;

    await runScript();
    return true;
  } catch (error) {
    debugLogError(
      "Error navigating to next page",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    isNavigating = false;
    return false;
  }
}

async function runScript() {
  debugLogInfo(
    "runScript STARTED",
    { url: window.location.href, readyState: document.readyState },
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );

  try {
    await addDelay(3000);

    if (!isExtensionContextValid()) {
      debugLogError(
        "runScript: extension context invalid at start, stopping",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      return;
    }

    const currentUrl = window.location.href;

    if (
      currentUrl.includes("/jobs/search/") &&
      currentUrl.includes("keywords=")
    ) {
      await chrome.storage.local.set({ lastJobSearchUrl: currentUrl });
    }

    const scriptStarted = await startScript();
    if (!scriptStarted) {
      debugLogError(
        "runScript: failed to start script, stopping",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      return;
    }

    await fillSearchFieldIfEmpty();

    const isRunning = await checkAndPrepareRunState(true);
    if (!isRunning) {
      debugLogCritical(
        "runScript: state check failed, script not running",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      return;
    }

    if (!isExtensionContextValid()) {
      debugLogError(
        "runScript: extension context invalid after state check, stopping",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      return;
    }

    await setAutoApplyRunning(true, "runScript reactivation");

    const fieldsComplete = await checkAndPromptFields();
    if (!fieldsComplete) {
      debugLogCritical(
        "runScript: default fields not configured, opening config page",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      await chrome.runtime.sendMessage({ action: "openDefaultInputPage" });
      return;
    }

    const limitReached = await checkLimitReached();
    if (limitReached) {
      debugLogCritical(
        "runScript: daily application limit reached, stopping",
        null,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
      const feedbackMessageElement = document.querySelector(
        ".artdeco-inline-feedback__message"
      );
      toggleBlinkingBorder(feedbackMessageElement);
      return;
    }

    const {
      titleSkipEnabled,
      titleFilterEnabled,
      badWordsEnabled,
      titleFilterWords,
      titleSkipWords,
    } = await chrome.storage.local.get([
      "titleSkipEnabled",
      "titleFilterEnabled",
      "badWordsEnabled",
      "titleFilterWords",
      "titleSkipWords",
    ]);

    const listItems = await waitForElements({
      elementOrSelector: ".scaffold-layout__list-item",
    });

    debugLog(
      `Processing ${listItems.length} job list items`,
      null,
      false,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );

    for (let i = 0; i < listItems.length; i++) {
      const listItem = listItems[i];

      if (i % 5 === 0 && !isExtensionContextValid()) {
        debugLogError(
          "Extension context lost during job processing",
          null,
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
        return;
      }

      const stillRunning = await checkAndPrepareRunState();
      if (!stillRunning) {
        return;
      }

      await addDelay(300);
      let canClickToJob = true;

      const stillRunning2 = await checkAndPrepareRunState();
      if (!stillRunning2) {
        return;
      }

      await closeApplicationSentModal();

      const saveModalBefore = await handleSaveApplicationModal();
      if (saveModalBefore) {
        debugLog(
          "Save application modal handled before job processing",
          null,
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
      }

      const linksElements = await waitForElements({
        elementOrSelector:
          ".artdeco-entity-lockup__title .job-card-container__link",
        timeout: 5000,
        contextNode: listItem,
      });
      const jobNameLink = linksElements?.[0];
      if (!jobNameLink) {
        canClickToJob = false;
      } else {
        jobNameLink?.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      const jobFooter = listItem.querySelector('[class*="footer"]');
      if (jobFooter && jobFooter.textContent.trim() === "Applied") {
        canClickToJob = false;
      }

      const companyNames = listItem.querySelectorAll('[class*="subtitle"]');
      const companyNamesArray = Array.from(companyNames).map((el) =>
        el.textContent.trim()
      );
      const companyName = companyNamesArray?.[0] ?? "";

      const jobTitle = getJobTitle(jobNameLink);

      if (!jobTitle) {
        canClickToJob = false;
      }

      if (titleSkipEnabled) {
        const matchedSkipWord = titleSkipWords.find((word) =>
          jobTitle.toLowerCase().includes(word.toLowerCase())
        );
        if (matchedSkipWord) {
          debugLogInfo(
            `skipJob: found skip word "${matchedSkipWord}", skipping job`,
            {
              url: window.location.href,
              companyName,
              jobTitle,
              matchedWord: matchedSkipWord,
              reason: "titleSkip",
            },
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
          canClickToJob = false;
        }
      }
      if (titleFilterEnabled) {
        const matchedFilterWord = titleFilterWords.find((word) =>
          jobTitle.toLowerCase().includes(word.toLowerCase())
        );
        if (!matchedFilterWord) {
          debugLogInfo(
            `skipJob: no filter word matched, skipping job`,
            {
              url: window.location.href,
              companyName,
              jobTitle,
              reason: "titleFilter",
            },
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
          canClickToJob = false;
        }
      }

      const stillRunning3 = await checkAndPrepareRunState();
      if (!stillRunning3) {
        return;
      }

      if (canClickToJob) {
        try {
          await clickElement({ elementOrSelector: jobNameLink });
          const stillRunning4 = await checkAndPrepareRunState();
          if (!stillRunning4) {
            return;
          }
        } catch (error) {
          debugLogError(
            "Error clicking job link",
            error,
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
        }
      }

      try {
        const mainContentElementWait = await waitForElements({
          elementOrSelector: ".jobs-details__main-content",
        });
        const mainContentElement = mainContentElementWait?.[0];
        if (!mainContentElement) {
          canClickToJob = false;
        }
      } catch (e) {
        debugLogError(
          "Failed to find main job content",
          e,
          Array.from(
            new Set(
              new Error().stack
                .replace(/Error/g, "")
                .match(/^\s*at.*$/gm)
                .map((i) => i.trim())
            )
          ).join("\n")
        );
      }

      const stillRunning5 = await checkAndPrepareRunState();
      if (!stillRunning5) {
        return;
      }

      if (canClickToJob) {
        await clickJob(listItem, companyName, jobTitle, badWordsEnabled);

        const saveModalAfter = await handleSaveApplicationModal();
        if (saveModalAfter) {
          debugLog(
            "Save application modal handled after job processing",
            null,
            false,
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
        }
      }
    }

    const finalRunCheck = await checkAndPrepareRunState();
    if (finalRunCheck) {
      await goToNextPage();
    }
  } catch (error) {
    const message = "Error in runScript: " + error?.message + " script stopped";
    debugLogError(
      "Critical error in runScript",
      { error: error?.message, stack: error?.stack },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    console.trace(message);
    await stopScript();
  }

  debugLogInfo(
    "runScript ENDED",
    null,
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showNotOnJobSearchAlert") {
    const modalWrapper = document.getElementById("notOnJobSearchOverlay");
    if (modalWrapper) {
      modalWrapper.style.display = "flex";
      sendResponse({ success: true });
    } else {
      sendResponse({
        success: false,
        error: "onotOnJobSearchOverlay not found",
      });
    }
  } else if (message.action === "showFormControlAlert") {
    const modalWrapper = document.getElementById("formControlOverlay");
    if (modalWrapper) {
      modalWrapper.style.display = "flex";
    } else {
      sendResponse({ success: false, error: "formControlOverlay not found" });
    }
  } else if (message.action === "checkScriptRunning") {
    chrome.storage.local.get("autoApplyRunning", (result) => {
      sendResponse({ isRunning: Boolean(result?.autoApplyRunning) });
    });
    return true;
  }
  if (message.action === "getCurrentUrl") {
    sendResponse({ url: window.location.href });
  }
  if (message.action === "showSavedLinksModal") {
    const modalWrapper = document.getElementById("savedLinksOverlay");
    if (modalWrapper) {
      const linksData = message.savedLinks;
      modalWrapper.style.display = "flex";
      const listEl = modalWrapper.querySelector("#savedLinksList");
      if (listEl) {
        listEl.innerHTML = "";
        Object.entries(linksData).forEach(([name, url]) => {
          const li = document.createElement("li");
          li.className = "saved-link-item";
          const nameEl = document.createElement("span");
          nameEl.textContent = name;
          li.appendChild(nameEl);
          const goButton = document.createElement("button");
          goButton.className = "modal-button primary go-button";
          goButton.textContent = "Go";
          goButton.addEventListener("click", () => {
            if (typeof url === "string") {
              window.open(url, "_blank");
              void chrome.runtime.sendMessage({
                action: "openTabAndRunScript",
                url: url,
              });
            } else {
              console.trace("Invalid url type:" + String(typeof url));
            }
          });
          li.appendChild(goButton);
          const deleteButton = document.createElement("button");
          deleteButton.className = "modal-button danger delete-button";
          deleteButton.textContent = "Delete";
          deleteButton.addEventListener("click", () => {
            chrome.storage.local.get("savedLinks", (result) => {
              const savedLinks = result.savedLinks || {};
              delete savedLinks[name];
              chrome.storage.local.set({ savedLinks }, () => {
                li.remove();
              });
            });
          });
          li.appendChild(deleteButton);
          listEl.appendChild(li);
        });
      }
    }
    sendResponse({ success: true });
  }
  if (message.action === "showRunningModal") {
    sendResponse({ success: true });
  } else if (message.action === "hideRunningModal") {
    const modalWrapper = document.getElementById("scriptRunningOverlay");
    if (modalWrapper) {
      modalWrapper.style.display = "none";
      sendResponse({ success: true });
    } else {
      sendResponse({
        success: false,
        message: "scriptRunningOverlay not found",
      });
    }
  }
});

window.addEventListener("error", function (event) {
  if (isExtensionContextValidQuiet()) {
    debugLogError(
      "Window error detected",
      {
        message: event.error?.message,
        filename: event.filename,
        lineno: event.lineno,
        stack: event.error?.stack,
      },
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
  }

  if (
    event.error &&
    event.error.message &&
    event.error.message.includes("Extension context invalidated")
  ) {
    try {
      const modalWrapper = document.getElementById("scriptRunningOverlay");
      if (modalWrapper) {
        modalWrapper.style.display = "none";
      }
    } catch (error) {}
  }
});

function isExtensionContextValid() {
  try {
    return !!chrome?.runtime?.id;
  } catch (error) {
    debugLogError(
      "Extension context check failed",
      error,
      Array.from(
        new Set(
          new Error().stack
            .replace(/Error/g, "")
            .match(/^\s*at.*$/gm)
            .map((i) => i.trim())
        )
      ).join("\n")
    );
    return false;
  }
}

function startExtensionContextMonitoring() {
  debugLogInfo(
    "Starting enhanced extension context monitoring",
    null,
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );

  let contextLossCount = 0;

  extensionContextCheckInterval = setInterval(async () => {
    try {
      if (!isExtensionContextValid()) {
        contextLossCount++;

        if (contextLossCount >= 3) {
          debugLogCritical(
            "Extension context lost permanently after multiple checks",
            { contextLossCount, attempts: 3 },
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
          void stopScript();
          clearInterval(extensionContextCheckInterval);
        } else {
          debugLogInfo(
            `Extension context check failed (attempt ${contextLossCount}/3)`,
            { contextLossCount },
            Array.from(
              new Set(
                new Error().stack
                  .replace(/Error/g, "")
                  .match(/^\s*at.*$/gm)
                  .map((i) => i.trim())
              )
            ).join("\n")
          );
        }
      } else {
        contextLossCount = 0;
        await updateScriptActivity();
      }
    } catch (error) {
      debugLogError(
        "Error during extension context monitoring",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }
  }, 10000);

  startSaveModalMonitoring();
}

function stopExtensionContextMonitoring() {
  debugLogInfo(
    "Stopping extension context monitoring",
    null,
    Array.from(
      new Set(
        new Error().stack
          .replace(/Error/g, "")
          .match(/^\s*at.*$/gm)
          .map((i) => i.trim())
      )
    ).join("\n")
  );
  if (extensionContextCheckInterval) {
    clearInterval(extensionContextCheckInterval);
    extensionContextCheckInterval = null;
  }

  stopSaveModalMonitoring();
}

function startSaveModalMonitoring() {
  saveModalCheckInterval = setInterval(async () => {
    if (isSaveModalBeingHandled) {
      return;
    }

    const saveModal = document.querySelector(
      '[data-test-modal=""][role="alertdialog"]'
    );
    if (saveModal) {
      const titleElement = saveModal.querySelector(
        "h2[data-test-dialog-title]"
      );
      if (
        titleElement &&
        titleElement.textContent.includes("Save this application?")
      ) {
        debugLogInfo(
          "Background monitor detected save modal - triggering handle",
          {
            timestamp: new Date().toISOString(),
            modalFound: true,
          }
        );

        const saveModalHandled = await handleSaveApplicationModal();
        if (saveModalHandled) {
          debugLogInfo("Save modal handled successfully by background monitor");
        }
      }
    }
  }, 5000);
}

function stopSaveModalMonitoring() {
  if (saveModalCheckInterval) {
    clearInterval(saveModalCheckInterval);
    saveModalCheckInterval = null;
  }
}

window.addEventListener("load", function () {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  try {
    chrome.storage.local.get(
      ["shouldRestartScript", "loopRestartUrl"],
      ({ shouldRestartScript, loopRestartUrl }) => {
        try {
          if (!isExtensionContextValidQuiet()) {
            return;
          }

          if (shouldRestartScript && loopRestartUrl) {
            debugLogInfo(
              "Window load event triggered - script restart conditions met",
              {
                url: window.location.href,
              },
              Array.from(
                new Set(
                  new Error().stack
                    .replace(/Error/g, "")
                    .match(/^\s*at.*$/gm)
                    .map((i) => i.trim())
                )
              ).join("\n")
            );

            const currentUrl = new URL(window.location.href);
            const savedUrl = new URL(loopRestartUrl);

            const isJobSearchPage =
              currentUrl.pathname.includes("/jobs/search/");
            const hasKeywords =
              currentUrl.searchParams.has("keywords") ||
              savedUrl.searchParams.has("keywords");
            const isStartPage =
              currentUrl.searchParams.get("start") === "1" ||
              !currentUrl.searchParams.has("start");

            if (isJobSearchPage && hasKeywords && isStartPage) {
              debugLogInfo(
                "Window load: conditions met, restarting script",
                null,
                Array.from(
                  new Set(
                    new Error().stack
                      .replace(/Error/g, "")
                      .match(/^\s*at.*$/gm)
                      .map((i) => i.trim())
                  )
                ).join("\n")
              );

              if (isExtensionContextValidQuiet()) {
                chrome.storage.local.remove([
                  "loopRestartUrl",
                  "shouldRestartScript",
                ]);
              }

              setTimeout(() => {
                startScript();
                startExtensionContextMonitoring();
                runScript();
              }, 3000);
            } else if (currentUrl.href.includes("JOBS_HOME_JYMBII")) {
              setTimeout(() => {
                window.location.href = loopRestartUrl;
              }, 2000);
            } else {
              if (isExtensionContextValidQuiet()) {
                chrome.storage.local.remove([
                  "loopRestartUrl",
                  "shouldRestartScript",
                ]);
              }
              setAutoApplyRunningSilent(false);
            }
          } else {
            setAutoApplyRunningSilent(false);
            chrome.storage.local.remove(["lastScriptActivity"]);
          }
        } catch (error) {
          if (isExtensionContextValidQuiet()) {
            debugLogError(
              "Window load: error during processing",
              error,
              Array.from(
                new Set(
                  new Error().stack
                    .replace(/Error/g, "")
                    .match(/^\s*at.*$/gm)
                    .map((i) => i.trim())
                )
              ).join("\n")
            );
          }
        }
      }
    );
  } catch (error) {}
});

try {
  window.addEventListener("beforeunload", function () {
    try {
      debugLogInfo(
        "Page beforeunload detected - preserving script state",
        {
          url: window.location.href,
          reason: "page_navigation",
        },
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );

      chrome.storage.local.get("autoApplyRunning", (result) => {
        if (result?.autoApplyRunning) {
          chrome.storage.local.set({
            shouldRestartScript: true,
            loopRestartUrl: window.location.href,
          });
        }
      });

      stopExtensionContextMonitoring();
    } catch (error) {
      debugLogError(
        "Error in beforeunload handler",
        error,
        Array.from(
          new Set(
            new Error().stack
              .replace(/Error/g, "")
              .match(/^\s*at.*$/gm)
              .map((i) => i.trim())
          )
        ).join("\n")
      );
    }
  });
} catch (error) {}
