let defaultFields = {
  YearsOfExperience: "",
  City: "",
  FirstName: "",
  LastName: "",
  Email: "",
  PhoneNumber: "",
};

let prevSearchValue = "";

// Debug logging utility - only logs when script is running and for critical issues
function debugLog(message, data = null, forceLog = false, callerInfo = null) {
  // Check extension context first to avoid "Extension context invalidated" errors
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  // Only log if script is running or if it's a forced log (errors)
  if (!forceLog) {
    try {
      chrome.storage.local.get("autoApplyRunning", (result) => {
        if (chrome.runtime.lastError) {
          return; // Context invalid, don't log
        }
        if (!result?.autoApplyRunning) {
          return; // Don't log if script is not running
        }
        writeLog(message, data, false, "SCRIPT", callerInfo);
      });
    } catch (error) {
      // Context invalid, fail silently
      return;
    }
  } else {
    writeLog(message, data, true, "SCRIPT", callerInfo);
  }
}

// Error logging - always logs regardless of script state
function debugLogError(message, error = null, callerInfo = null) {
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

// Critical logging - always logs for important state changes
function debugLogCritical(message, data = null, callerInfo = null) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  writeLog(message, data, true, "CRITICAL", callerInfo);
}

// Info logging - for normal operations, only when script is running
function debugLogInfo(message, data = null, callerInfo = null) {
  if (!isExtensionContextValidQuiet()) {
    return;
  }

  try {
    chrome.storage.local.get("autoApplyRunning", (result) => {
      if (chrome.runtime.lastError) {
        return;
      }
      if (!result?.autoApplyRunning) {
        return;
      }
      writeLog(message, data, false, "INFO", callerInfo);
    });
  } catch (error) {
    return;
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

  // Enhanced caller information detection
  if (!callerInfo) {
    const stack = new Error().stack;
    callerInfo = "content.js:?";
    if (stack) {
      const stackLines = stack.split("\n").filter((line) => line.trim());

      // Skip internal functions to find the actual caller
      let callerLine = null;
      for (let i = 0; i < stackLines.length; i++) {
        const line = stackLines[i];

        // Skip these internal functions
        if (
          line.includes("writeLog") ||
          line.includes("debugLog") ||
          line.includes("debugLogError") ||
          line.includes("debugLogCritical") ||
          line.includes("debugLogInfo")
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
            callerInfo = "content.js:?";
          }
        }
      }
    }
  }

  // Use filename:line as prefix instead of log type
  const logMessage = `[LinkedIn AutoApply Debug] ${timestamp} [${callerInfo}]: ${message}`;
  console.log("[DEBUGGER](LOG MESSAGE): ", logMessage);
  if (data) {
    console.log("[DEBUGGER](LOG DATA): ", data);
  }

  // Store debug logs in local storage for debugging
  try {
    if (!isExtensionContextValidQuiet()) {
      return;
    }

    chrome.storage.local.get("debugLogs", (result) => {
      if (chrome.runtime.lastError) {
        return;
      }

      const logs = result.debugLogs || [];
      logs.push({
        timestamp,
        message,
        data,
        callerInfo,
        logType,
        isError: logType === "ERROR",
        isCritical: logType === "CRITICAL" || isForced,
      });
      // Keep only last 50 logs (reduced from 100)
      if (logs.length > 50) {
        logs.splice(0, logs.length - 50);
      }
      chrome.storage.local.set({ debugLogs: logs });
    });
  } catch (error) {
    // Fail silently if extension context is invalid
    return;
  }
}

// Silent extension context check (doesn't log errors)
function isExtensionContextValidQuiet() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

async function stopScript() {
  debugLogCritical(
    "stopScript called - script stopping",
    null,
    "content.js:208"
  );

  stopExtensionContextMonitoring();

  const modalWrapper = document.getElementById("scriptRunningOverlay");
  if (modalWrapper) {
    modalWrapper.style.display = "none";
  }

  await chrome.storage.local.set({ autoApplyRunning: false });
  await chrome.storage.local.remove(["loopRestartUrl", "shouldRestartScript"]);

  try {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== "function") {
      debugLogError(
        "Chrome tabs API not available in stopScript",
        null,
        "content.js:222"
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
    debugLogError("Error in stopScript", error, "content.js:251");
  }
  prevSearchValue = "";
}

async function startScript() {
  debugLogInfo("startScript called", null, "content.js:241");

  if (!isExtensionContextValid()) {
    debugLogError("Extension context invalid in startScript, cannot start");
    return false;
  }

  try {
    await chrome.runtime.sendMessage({ action: "autoApplyRunning" });
    await chrome.storage.local.set({ autoApplyRunning: true });

    startExtensionContextMonitoring();

    return true;
  } catch (error) {
    debugLogError("Error in startScript", error);
    return false;
  }
}

async function checkAndPrepareRunState() {
  return new Promise((resolve) => {
    chrome.storage.local.get("autoApplyRunning", (result) => {
      const isRunning = result && result.autoApplyRunning;
      if (isRunning) {
        resolve(true);
      } else {
        debugLogCritical(
          "checkAndPrepareRunState: script not running, stopping process",
          null,
          "content.js:258"
        );
        resolve(false);
        prevSearchValue = "";
      }
    });
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
      const isRunning = await checkAndPrepareRunState();
      if (!isRunning) {
        debugLogCritical(
          "clickJob: script not running, aborting job processing",
          null,
          "content.js:278"
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
                null,
                "content.js:286"
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
      debugLogError("Error in clickJob", error);
      resolve(null);
    }
  });
}

async function performInputFieldChecks() {
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getInputFieldConfig" }, resolve);
    });
    const questionContainers = document.querySelectorAll(
      ".fb-dash-form-element"
    );
    for (const container of questionContainers) {
      let label = container.querySelector(".artdeco-text-input--label");
      if (!label) {
        label = getElementsByXPath({
          context: container,
          xpath: ".//label",
        })?.[0];
      }
      const inputField = container.querySelector(
        'input:not([type="hidden"]), textarea'
      );

      if (!label || !inputField) {
        continue;
      }
      let labelText = label.textContent.trim();
      if (inputField.type === "checkbox") {
        const checkboxLabel = labelText.toLowerCase();
        if (checkboxLabel.includes("terms")) {
          setNativeValue(inputField, true);
          inputField.checked = true;
          inputField.dispatchEvent(new Event("change", { bubbles: true }));
        }
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
                if (inputField.matches('[role="combobox"]')) {
                  await fillAutocompleteField(inputField, valueFromConfigs);
                } else {
                  setNativeValue(inputField, valueFromConfigs);
                }
              }
            }
          } else {
            if (inputField.matches('[role="combobox"]')) {
              await fillAutocompleteField(inputField, valueFromDefault);
            } else {
              setNativeValue(inputField, valueFromDefault);
            }
          }
        }
        if (!inputField.value) {
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

    // Check for "Save this application?" modal
    if (
      (modalHeader &&
        modalHeader.textContent.includes("Save this application?")) ||
      (modalContent &&
        modalContent.textContent.includes(
          "Save to return to this application later"
        ))
    ) {
      // Try to click "Discard" button first (more reliable)
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

      // Fallback to dismiss button
      const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
      if (dismissButton) {
        dismissButton.click();
        await addDelay(1000);
        return true;
      }

      debugLogError("Save application modal found but no buttons to close it");
    }
  }

  return false;
}

// Enhanced function to handle save application modal specifically
async function handleSaveApplicationModal() {
  const saveModal = document.querySelector(
    '[data-test-modal=""][role="alertdialog"]'
  );
  if (saveModal) {
    const titleElement = saveModal.querySelector("h2[data-test-dialog-title]");
    if (
      titleElement &&
      titleElement.textContent.includes("Save this application?")
    ) {
      debugLog("Save application modal detected and handling");

      // Always click "Discard" for automation
      const discardButton = saveModal.querySelector(
        "button[data-test-dialog-secondary-btn]"
      );
      if (discardButton) {
        discardButton.click();
        await addDelay(1000);
        return true;
      }

      // Fallback to dismiss
      const dismissButton = saveModal.querySelector(
        'button[aria-label="Dismiss"]'
      );
      if (dismissButton) {
        debugLogError("No discard button found, using dismiss as fallback");
        dismissButton.click();
        await addDelay(1000);
        return true;
      }

      debugLogError("Save application modal found but no way to close it");
    }
  }

  return false;
}

async function checkForError() {
  const feedbackMessageElement = document.querySelector(
    ".artdeco-inline-feedback__message"
  );
  return feedbackMessageElement !== null;
}

async function terminateJobModel(context = document) {
  // First try to handle save application modal
  const saveModalHandled = await handleSaveApplicationModal();
  if (saveModalHandled) {
    return;
  }

  const dismissButton = context.querySelector('button[aria-label="Dismiss"]');
  if (dismissButton) {
    dismissButton.click();
    dismissButton.dispatchEvent(new Event("change", { bubbles: true }));
    await addDelay(1000); // Increased delay to allow modal to appear

    // Check for save application modal after dismiss
    const saveModalAfterDismiss = await handleSaveApplicationModal();
    if (saveModalAfterDismiss) {
      return;
    }

    const discardButton = Array.from(
      document.querySelectorAll("button[data-test-dialog-secondary-btn]")
    ).find((button) => button.textContent.trim() === "Discard");
    if (discardButton) {
      discardButton.click();
      discardButton.dispatchEvent(new Event("change", { bubbles: true }));
      await addDelay(500);
    }
  } else {
    debugLogError("terminateJobModel: no dismiss button found");
  }
}

async function runValidations() {
  // Check for save application modal at the start
  const saveModalHandled = await handleSaveApplicationModal();
  if (saveModalHandled) {
    return;
  }

  await validateAndCloseConfirmationModal();
  await performInputFieldChecks();
  await performRadioButtonChecks();
  await performDropdownChecks();
  await performCheckBoxFieldCityCheck();

  // Check again after all validations
  await handleSaveApplicationModal();
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

        // Check for save application modal at the beginning
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
            await addDelay(2000); // Increased delay after submit

            // Check for save application modal after submit
            const saveModalAfterSubmit = await handleSaveApplicationModal();
            if (saveModalAfterSubmit) {
              debugLog("Save application modal handled after submit");
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
            const isError = await checkForError();

            if (isError) {
              debugLogError(
                "Error detected in form validation, terminating job modal",
                null,
                "content.js:388"
              );
              await terminateJobModel();
            } else {
              buttonToClick?.scrollIntoView({ block: "center" });
              await addDelay();
              buttonToClick.click();

              // Check for save application modal after clicking next/review
              await addDelay(1000);
              const saveModalAfterNext = await handleSaveApplicationModal();
              if (saveModalAfterNext) {
                debugLog("Save application modal handled after next/review");
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

        // Final check for save application modal
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
          debugLog(
            "runApplyModel timeout reached (30s) - this is normal behavior",
            null,
            "content.js:402"
          );
          resolve(null);
        }, 30000);
      }),
    ]);
  } catch (error) {
    const message = "runApplyModel error:" + error?.message;
    debugLogError("runApplyModel critical error", error);
    console.trace(message);
    console.error(message);
  }
}

async function runFindEasyApply(jobTitle, companyName) {
  return new Promise(async (resolve) => {
    try {
      await addDelay(1000);

      // Check for save application modal at the start
      const saveModalHandled = await handleSaveApplicationModal();
      if (saveModalHandled) {
        resolve(null);
        return;
      }

      const currentPageLink = window.location.href;

      // Check if extension context is still valid
      if (!chrome || !chrome.runtime) {
        debugLogError("Extension context invalidated in runFindEasyApply");
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

      // Final check for save application modal
      await handleSaveApplicationModal();

      resolve(null);
    } catch (error) {
      debugLogError("Error in runFindEasyApply", error);
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
  // First check for save application modal
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
  debugLogInfo("handleLoopRestart called", null, "content.js:487");
  try {
    const { lastJobSearchUrl, loopRunningDelay } =
      await chrome.storage.local.get(["lastJobSearchUrl", "loopRunningDelay"]);

    const delayInMs = (loopRunningDelay || 0) * 1000;

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

    await chrome.storage.local.set({
      loopRestartUrl: newUrl,
      shouldRestartScript: true,
    });

    window.location.href = newUrl;
  } catch (error) {
    debugLogError("Error in handleLoopRestart", error);
    stopScript();
  }
}

async function goToNextPage() {
  await addDelay();
  if (isNavigating) {
    return false;
  }

  isNavigating = true;

  try {
    // Check if we're still running before proceeding
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
      debugLogError("goToNextPage waitForElements error", error);
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
    debugLogError("Error navigating to next page", error);
    isNavigating = false;
    return false;
  }
}

async function runScript() {
  debugLogInfo(
    "runScript STARTED",
    {
      url: window.location.href,
      readyState: document.readyState,
    },
    "content.js:524"
  );

  try {
    await addDelay(3000);

    if (!isExtensionContextValid()) {
      debugLogError("runScript: extension context invalid at start, stopping");
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
      debugLogError("runScript: failed to start script, stopping");
      return;
    }

    await fillSearchFieldIfEmpty();

    const isRunning = await checkAndPrepareRunState();
    if (!isRunning) {
      debugLogCritical("runScript: state check failed, script not running");
      return;
    }

    if (!isExtensionContextValid()) {
      debugLogError(
        "runScript: extension context invalid after state check, stopping",
        null,
        "content.js:538"
      );
      return;
    }

    await chrome.storage.local.set({ autoApplyRunning: true });

    const fieldsComplete = await checkAndPromptFields();
    if (!fieldsComplete) {
      debugLogCritical(
        "runScript: default fields not configured, opening config page",
        null,
        "content.js:546"
      );
      await chrome.runtime.sendMessage({ action: "openDefaultInputPage" });
      return;
    }

    const limitReached = await checkLimitReached();
    if (limitReached) {
      debugLogCritical("runScript: daily application limit reached, stopping");
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
      "content.js:562"
    );

    for (let i = 0; i < listItems.length; i++) {
      const listItem = listItems[i];

      if (i % 5 === 0 && !isExtensionContextValid()) {
        debugLogError("Extension context lost during job processing");
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
        debugLog("Save application modal handled before job processing");
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
        if (
          titleSkipWords.some((word) =>
            jobTitle.toLowerCase().includes(word.toLowerCase())
          )
        ) {
          canClickToJob = false;
        }
      }
      if (titleFilterEnabled) {
        if (
          !titleFilterWords.some((word) =>
            jobTitle.toLowerCase().includes(word.toLowerCase())
          )
        ) {
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
          debugLogError("Error clicking job link", error);
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
        debugLogError("Failed to find main job content", e);
      }

      const stillRunning5 = await checkAndPrepareRunState();
      if (!stillRunning5) {
        return;
      }

      if (canClickToJob) {
        await clickJob(listItem, companyName, jobTitle, badWordsEnabled);

        const saveModalAfter = await handleSaveApplicationModal();
        if (saveModalAfter) {
          debugLog("Save application modal handled after job processing");
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
      {
        error: error?.message,
        stack: error?.stack,
      },
      "content.js:600"
    );
    console.trace(message);
    await stopScript();
  }

  debugLogInfo("runScript ENDED", null, "content.js:606");
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
    checkAndPrepareRunState()
      .then((isRunning) => {
        sendResponse({ isRunning: Boolean(isRunning) });
      })
      .catch(() => {
        sendResponse({ isRunning: false });
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
  debugLogError(
    "Window error detected",
    {
      message: event.error?.message,
      filename: event.filename,
      lineno: event.lineno,
      stack: event.error?.stack,
    },
    "content.js:648"
  );

  if (
    event.error &&
    event.error.message &&
    event.error.message.includes("Extension context invalidated")
  ) {
    debugLogCritical("Extension context invalidated, stopping script");

    try {
      const modalWrapper = document.getElementById("scriptRunningOverlay");
      if (modalWrapper) {
        modalWrapper.style.display = "none";
      }
    } catch (error) {
      debugLogError(
        "Error hiding modal after extension context invalidation",
        error
      );
    }
  }
});

// Additional checks for extension context
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    debugLogError("Extension context check failed", error);
    return false;
  }
}

// Enhanced extension context monitoring
let extensionContextCheckInterval;
let saveModalCheckInterval;

function startExtensionContextMonitoring() {
  debugLogInfo("Starting extension context monitoring");
  extensionContextCheckInterval = setInterval(() => {
    if (!isExtensionContextValid()) {
      debugLogError("Extension context lost during monitoring");
      stopScript();
      clearInterval(extensionContextCheckInterval);
    }
  }, 5000); // Check every 5 seconds

  // Also start periodic save modal checking
  startSaveModalMonitoring();
}

function stopExtensionContextMonitoring() {
  debugLogInfo("Stopping extension context monitoring");
  if (extensionContextCheckInterval) {
    clearInterval(extensionContextCheckInterval);
    extensionContextCheckInterval = null;
  }

  stopSaveModalMonitoring();
}

function startSaveModalMonitoring() {
  saveModalCheckInterval = setInterval(async () => {
    const saveModalHandled = await handleSaveApplicationModal();
    if (saveModalHandled) {
      debugLog("Save modal detected and handled by background monitor");
    }
  }, 3000); // Check every 3 seconds
}

function stopSaveModalMonitoring() {
  if (saveModalCheckInterval) {
    clearInterval(saveModalCheckInterval);
    saveModalCheckInterval = null;
  }
}

window.addEventListener("load", function () {
  // Only log if we're actually going to restart the script
  chrome.storage.local.get(
    ["shouldRestartScript", "loopRestartUrl"],
    ({ shouldRestartScript, loopRestartUrl }) => {
      try {
        if (shouldRestartScript && loopRestartUrl) {
          debugLogInfo(
            "Window load event triggered - script restart conditions met",
            {
              url: window.location.href,
            },
            "content.js:702"
          );

          const currentUrl = new URL(window.location.href);
          const savedUrl = new URL(loopRestartUrl);

          const isJobSearchPage = currentUrl.pathname.includes("/jobs/search/");
          const hasKeywords =
            currentUrl.searchParams.has("keywords") ||
            savedUrl.searchParams.has("keywords");
          const isStartPage =
            currentUrl.searchParams.get("start") === "1" ||
            !currentUrl.searchParams.has("start");

          if (isJobSearchPage && hasKeywords && isStartPage) {
            debugLogInfo("Window load: conditions met, restarting script");
            chrome.storage.local.remove([
              "loopRestartUrl",
              "shouldRestartScript",
            ]);
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
            chrome.storage.local.remove([
              "loopRestartUrl",
              "shouldRestartScript",
            ]);
            chrome.storage.local.set({ autoApplyRunning: false });
          }
        } else {
          // Don't log when just setting autoApplyRunning to false
          chrome.storage.local.set({ autoApplyRunning: false });
        }
      } catch (error) {
        debugLogError("Window load: error during processing", error);
      }
    }
  );
});

try {
  window.addEventListener("beforeunload", function () {
    // Only log if the script was actually running

    chrome.storage.local.get("autoApplyRunning", (result) => {
      if (result?.autoApplyRunning) {
        debugLogInfo(
          "Window beforeunload event triggered - script was running",
          null,
          "content.js:728"
        );
      }
    });
    stopExtensionContextMonitoring();
    chrome.storage.local.set({ autoApplyRunning: false });
  });
} catch (error) {
  debugLogError("Error setting beforeunload listener", error);
}

// Function to get debug logs for debugging
async function getDebugLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get("debugLogs", (result) => {
      resolve(result.debugLogs || []);
    });
  });
}

// Function to clear debug logs
async function clearDebugLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.remove("debugLogs", () => {
      debugLogCritical("Debug logs cleared");
      resolve();
    });
  });
}
