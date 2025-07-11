async function addDelay(delay = 1000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, delay);
  });
}

function getTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return { day, month, year, hour, minute };
}

function getElementsByXPath({ xpath, context = document }) {
  const result = document.evaluate(
    xpath,
    context,
    null,
    XPathResult.ORDERED_NODE_ITERATOR_TYPE,
    null
  );

  const elements = [];
  let node = result.iterateNext();
  while (node) {
    if (node instanceof HTMLElement) {
      elements.push(node);
    }
    node = result.iterateNext();
  }

  return elements;
}

async function waitForElements({
  elementOrSelector,
  timeout = 5000,
  contextNode = document,
}) {
  return new Promise((resolve) => {
    try {
      const startTime = Date.now();

      const intervalId = setInterval(() => {
        let elements = [];

        if (typeof elementOrSelector === "string") {
          if (Array.isArray(contextNode)) {
            contextNode.forEach((node) => {
              if (node instanceof Element) {
                elements.push(...node.querySelectorAll(elementOrSelector));
              }
            });
          } else {
            elements = contextNode.querySelectorAll(elementOrSelector);
          }
        } else if (elementOrSelector instanceof Element) {
          elements = [elementOrSelector];
        } else if (Array.isArray(elementOrSelector)) {
          elements = elementOrSelector.filter((el) => el instanceof Element);
        } else {
          clearInterval(intervalId);
          resolve([]);
          return;
        }

        const visibleElements = [];
        for (let i = 0; i < elements.length; i++) {
          if (elements[i].offsetParent !== null && elements[i].isConnected) {
            visibleElements.push(elements[i]);
          }
        }

        if (visibleElements.length > 0) {
          clearInterval(intervalId);
          resolve(visibleElements);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(intervalId);
          resolve([]);
        }
      }, 100);
    } catch (e) {
      console.trace("Error in waitForElements: " + elementOrSelector);
    }
  });
}

async function clickElement({
  elementOrSelector,
  timeout = 5000,
  contextNode = document,
}) {
  return new Promise(async (resolve) => {
    try {
      let element;
      if (typeof elementOrSelector === "string") {
        const elements = await waitForElements({
          elementOrSelector,
          timeout,
          contextNode,
        });
        element = elements[0];
        if (!element) {
          console.trace(
            "log",
            "No element found for selector: " + elementOrSelector
          );
          return;
        }
      } else if (elementOrSelector instanceof Element) {
        element = elementOrSelector;
      } else {
        console.trace(
          "log",
          "Argument must be a selector string or a DOM Element."
        );
        return;
      }

      if (element.offsetParent === null || !element.isConnected) {
        console.trace("Element is not visible or not connected");
        return;
      }
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      await addDelay(800);
      element.click();
      resolve(element);
    } catch (error) {
      console.trace("Element is not clickable:" + error?.message);
    }
  });
}

async function fillAutocompleteField(element, value) {
  console.log(`[AUTOCOMPLETE] Filling field with value: "${value}"`);
  console.log(
    `[AUTOCOMPLETE] Element ID: ${element.id}, Role: ${element.getAttribute(
      "role"
    )}`
  );

  element.focus();
  await addDelay(100);
  setNativeValue(element, value);
  await addDelay(300);

  let dropdownContainer = null;

  const dropdownId =
    element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
  if (dropdownId) {
    dropdownContainer = document.getElementById(dropdownId);
    console.log(
      `[AUTOCOMPLETE] Found dropdown via aria-controls/aria-owns: ${dropdownId}`
    );
  }

  if (!dropdownContainer || dropdownContainer.offsetHeight === 0) {
    console.log(
      `[AUTOCOMPLETE] Searching for dropdown using universal approach`
    );

    const searchContainers = [
      element.closest("div"),
      element.parentElement,
      document.body,
    ];

    for (const searchContainer of searchContainers) {
      if (!searchContainer) continue;

      const dropdownSelectors = [
        '[role="listbox"]',
        ".basic-typeahead__selectable",
        ".search-typeahead-v2__results",
        ".typeahead-results",
        "[data-test-single-typeahead-entity-form-search-result]",
        ".dropdown-menu",
        ".suggestions",
        ".autocomplete-dropdown",
      ];

      for (const selector of dropdownSelectors) {
        const found = searchContainer.querySelector(selector);
        if (
          found &&
          (found.offsetParent !== null ||
            found.querySelector('[role="option"]'))
        ) {
          dropdownContainer = found;
          console.log(
            `[AUTOCOMPLETE] Found dropdown with selector: ${selector} in`,
            searchContainer === document.body ? "document" : "container"
          );
          break;
        }
      }

      if (dropdownContainer) break;
    }

    if (!dropdownContainer) {
      await addDelay(200);

      const dropdownSelectors = [
        '[role="listbox"]:not([style*="display: none"])',
        ".basic-typeahead__selectable",
        '.search-typeahead-v2__results [role="option"]',
        "[data-test-single-typeahead-entity-form-search-result]",
        ".search-typeahead-v2__hit",
      ];

      for (const selector of dropdownSelectors) {
        const foundDropdown = document.querySelector(selector);
        if (
          foundDropdown &&
          (foundDropdown.offsetParent !== null ||
            foundDropdown.closest('[role="listbox"]'))
        ) {
          dropdownContainer =
            foundDropdown.closest('[role="listbox"]') ||
            foundDropdown.parentElement ||
            foundDropdown;
          console.log(
            `[AUTOCOMPLETE] Found dropdown with selector: ${selector}`
          );
          break;
        }
      }
    }
  }

  if (dropdownContainer) {
    const optionSelectors = [
      '[role="option"]',
      ".basic-typeahead__selectable",
      "[data-test-single-typeahead-entity-form-search-result]",
      ".search-typeahead-v2__hit",
      ".typeahead-option",
      ".dropdown-item",
      ".suggestion-item",
      "li",
      "div[data-testid]",
      "div[data-test]",
    ];

    let firstOption = null;
    for (const selector of optionSelectors) {
      const options = dropdownContainer.querySelectorAll(selector);
      if (options.length > 0) {
        for (const option of options) {
          if (option.offsetParent !== null && option.textContent?.trim()) {
            firstOption = option;
            break;
          }
        }
        if (firstOption) {
          console.log(
            `[AUTOCOMPLETE] Found options with selector: ${selector}`
          );
          break;
        }
      }
    }

    if (firstOption) {
      console.log(
        `[AUTOCOMPLETE] Found first option:`,
        firstOption.textContent?.trim()
      );
      try {
        firstOption.scrollIntoView({ block: "nearest" });
        await addDelay(100);
        firstOption.click();
        console.log(`[AUTOCOMPLETE] Successfully clicked option`);
        await addDelay(300);
      } catch (e) {
        console.error(
          `[AUTOCOMPLETE] Error clicking on option for ${element.id}:`,
          e
        );

        try {
          firstOption.dispatchEvent(
            new MouseEvent("mouseover", { bubbles: true })
          );
          await addDelay(100);
          firstOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          console.log(`[AUTOCOMPLETE] Fallback click successful`);
        } catch (fallbackError) {
          console.error(
            `[AUTOCOMPLETE] Fallback click also failed:`,
            fallbackError
          );
        }
      }
    } else {
      console.log(`[AUTOCOMPLETE] No clickable options found in dropdown`);
    }
  } else {
    console.log(`[AUTOCOMPLETE] No dropdown container found or not visible`);
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
  await addDelay(100);
  element.blur();
  await addDelay(100);
}

function normalizeString(str) {
  return str.toLowerCase().replace(/[\s-_]+/g, "");
}

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value"
  )?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    throw new Error("Unable to set value");
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findClosestField(defaultFields, inputString) {
  const normalizedInput = normalizeString(inputString);
  let substringMatches = [];

  for (const key in defaultFields) {
    const normalizedKey = normalizeString(key);
    if (
      normalizedKey.includes(normalizedInput) ||
      normalizedInput.includes(normalizedKey)
    ) {
      substringMatches.push(key);
    }
  }

  if (substringMatches.length === 1) {
    return defaultFields[substringMatches[0]];
  }
  if (substringMatches.length > 1) {
    let bestKey = null;
    let bestScore = Infinity;
    for (const key of substringMatches) {
      const normalizedKey = normalizeString(key);
      const distance = levenshteinDistance(normalizedInput, normalizedKey);
      const score =
        distance / Math.max(normalizedInput.length, normalizedKey.length);
      if (score < bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    return bestScore <= 0.4 ? defaultFields[bestKey] : undefined;
  }

  let bestKey = null;
  let bestScore = Infinity;
  for (const key in defaultFields) {
    const normalizedKey = normalizeString(key);
    const distance = levenshteinDistance(normalizedInput, normalizedKey);
    const score =
      distance / Math.max(normalizedInput.length, normalizedKey.length);
    if (score < bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestScore <= 0.4 ? defaultFields[bestKey] : undefined;
}
