let defaultFields = {
  YearsOfExperience: "",
  City: "",
  FirstName: "",
  LastName: "",
  Email: "",
  PhoneNumber: "",
};

let prevSearchValue = "";

async function stopScript() {
  const modalWrapper = document.getElementById("scriptRunningOverlay");
  if (modalWrapper) {
    modalWrapper.style.display = "none";
  }

  await chrome.storage.local.set({ autoApplyRunning: false });
  await chrome.storage.local.remove(["loopRestartUrl", "shouldRestartScript"]);

  try {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== "function") {
      console.error("Chrome tabs API not available");
      prevSearchValue = "";
      return;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs?.length > 0) {
      const currentTabId = tabs?.[0].id;
      const response = await chrome.runtime.sendMessage({
        action: "stopAutoApply",
        tabId: currentTabId,
      });
    }
  } catch (error) {
    console.error("Error in stopScript:", error);
  }
  prevSearchValue = "";
}

async function startScript() {
  await chrome.runtime.sendMessage({ action: "autoApplyRunning" });
  await chrome.storage.local.set({ autoApplyRunning: true });
}

async function checkAndPrepareRunState() {
  return new Promise((resolve) => {
    chrome.storage.local.get("autoApplyRunning", (result) => {
      if (result && result.autoApplyRunning) {
        resolve(true);
      } else {
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
    if (!(await checkAndPrepareRunState())) {
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
            resolve(null);
            return;
          }
        }
        await runFindEasyApply(jobTitle, companyName);
        resolve(null);
        return;
      }
    }
    await runFindEasyApply(jobTitle, companyName);
    resolve(null);
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
    if (
      modalHeader &&
      modalHeader.textContent.includes("Save this application?")
    ) {
      const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
      if (dismissButton) {
        dismissButton.click();
      }
    }
  }
}

async function checkForError() {
  const feedbackMessageElement = document.querySelector(
    ".artdeco-inline-feedback__message"
  );
  return feedbackMessageElement !== null;
}

async function terminateJobModel(context = document) {
  const dismissButton = context.querySelector('button[aria-label="Dismiss"]');
  if (dismissButton) {
    dismissButton.click();
    dismissButton.dispatchEvent(new Event("change", { bubbles: true }));
    await addDelay(500);
    const discardButton = Array.from(
      document.querySelectorAll("button[data-test-dialog-secondary-btn]")
    ).find((button) => button.textContent.trim() === "Discard");
    if (discardButton) {
      discardButton.click();
      discardButton.dispatchEvent(new Event("change", { bubbles: true }));
      await addDelay(500);
    }
  }
}

async function runValidations() {
  await validateAndCloseConfirmationModal();
  await performInputFieldChecks();
  await performRadioButtonChecks();
  await performDropdownChecks();
  await performCheckBoxFieldCityCheck();
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
            if (!(await checkAndPrepareRunState())) return;
            submitButton.click();
            await addDelay();
            if (!(await checkAndPrepareRunState())) return;
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
              await terminateJobModel();
            } else {
              buttonToClick?.scrollIntoView({ block: "center" });
              await addDelay();
              buttonToClick.click();
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
    const message = "runApplyModel error:" + error?.message;
    console.trace(message);
    console.error(message);
  }
}

async function runFindEasyApply(jobTitle, companyName) {
  return new Promise(async (resolve) => {
    await addDelay(1000);
    const currentPageLink = window.location.href;
    const externalApplyElements = getElementsByXPath({
      xpath: not_easy_apply_button,
    });
    if (externalApplyElements.length > 0) {
      await chrome.runtime.sendMessage({
        action: "externalApplyAction",
        data: { jobTitle, currentPageLink, companyName },
      });
    }
    const easyApplyElements = getElementsByXPath({ xpath: easy_apply_button });
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
    resolve(null);
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
  const modal = document.querySelector(".artdeco-modal");

  if (
    modal?.textContent.includes("Application sent") &&
    modal.textContent.includes("Your application was sent to")
  ) {
    modal.querySelector(".artdeco-modal__dismiss")?.click();
  }
}

let isNavigating = false;

async function handleLoopRestart() {
  try {
    const { lastJobSearchUrl, loopRunningDelay } = await chrome.storage.local.get([
      "lastJobSearchUrl",
      "loopRunningDelay"
    ]);
    
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
    console.trace("Error in handleLoopRestart: " + error?.message);
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
      console.trace("goToNextPage waitForElements error:" + error?.message);
    }

    await addDelay(1000);
    const scrollElement = document?.querySelector(
      ".scaffold-layout__list > div"
    );
    scrollElement?.scrollTo({
      top: scrollElement.scrollHeight,
    });

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
    console.error("Error navigating to next page:", error);
    isNavigating = false;
    return false;
  }
}

async function runScript() {
  try {
    await addDelay(3000);
    if (!chrome || !chrome.runtime) {
      console.error("Extension context invalidated");
      return;
    }

    const currentUrl = window.location.href;
    if (
      currentUrl.includes("/jobs/search/") &&
      currentUrl.includes("keywords=")
    ) {
      await chrome.storage.local.set({ lastJobSearchUrl: currentUrl });
    }

    await startScript();
    await fillSearchFieldIfEmpty();
    if (!(await checkAndPrepareRunState())) return;

    if (!chrome || !chrome.runtime) {
      console.error("Extension context invalidated");
      return;
    }

    await chrome.storage.local.set({ autoApplyRunning: true });

    const fieldsComplete = await checkAndPromptFields();
    if (!fieldsComplete) {
      await chrome.runtime.sendMessage({ action: "openDefaultInputPage" });
      return;
    }
    const limitReached = await checkLimitReached();

    if (limitReached) {
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

    for (const listItem of listItems) {
      if (!(await checkAndPrepareRunState())) return;
      await addDelay(300);
      let canClickToJob = true;
      if (!(await checkAndPrepareRunState())) return;
      await closeApplicationSentModal();
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
      if (!(await checkAndPrepareRunState())) return;
      if (canClickToJob) {
        try {
          await clickElement({ elementOrSelector: jobNameLink });
          if (!(await checkAndPrepareRunState())) return;
        } catch {}
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
        console.trace("Failed to find the main job content");
      }
      if (!(await checkAndPrepareRunState())) return;
      if (canClickToJob) {
        await clickJob(listItem, companyName, jobTitle, badWordsEnabled);
      }
    }

    if (await checkAndPrepareRunState()) {
      await goToNextPage();
    }
  } catch (error) {
    const message = "Error in runScript: " + error?.message + "script stopped";
    await stopScript();
  }
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
  if (
    event.error &&
    event.error.message &&
    event.error.message.includes("Extension context invalidated")
  ) {
    console.error("Extension context invalidated. Stopping script.");

    try {
      const modalWrapper = document.getElementById("scriptRunningOverlay");
      if (modalWrapper) {
        modalWrapper.style.display = "none";
      }
    } catch {}
  }
});

window.addEventListener("load", function () {
  chrome.storage.local.get(
    ["shouldRestartScript", "loopRestartUrl"],
    ({ shouldRestartScript, loopRestartUrl }) => {
      try {
        if (shouldRestartScript && loopRestartUrl) {
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
            chrome.storage.local.remove([
              "loopRestartUrl",
              "shouldRestartScript",
            ]);
            setTimeout(() => {
              startScript();
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
          if (shouldRestartScript && loopRestartUrl) {
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
              chrome.storage.local.remove([
                "loopRestartUrl",
                "shouldRestartScript",
              ]);
              setTimeout(() => {
                startScript();
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
            chrome.storage.local.set({ autoApplyRunning: false });
          }
          chrome.storage.local.set({ autoApplyRunning: false });
        }
      } catch {}
    }
  );
});

try {
  window.addEventListener("beforeunload", function () {
    chrome.storage.local.set({ autoApplyRunning: false });
  });
} catch  {}

