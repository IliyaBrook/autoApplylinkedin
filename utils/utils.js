async function addDelay(delay = 1000) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, delay);
    });
}

function getTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return {day, month, year, hour, minute};
}

/**
 * Finds elements by XPath.
 *
 * @param {string} xpath - The XPath expression to evaluate.
 * @param {Document | HTMLElement} [context=document] - The context node to search within.
 * @returns {HTMLElement[]} - An array of found elements.
 */
function getElementsByXPath({ xpath, context = document }) {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null
    )
    
    const elements = []
    let node = result.iterateNext()
    while (node) {
        if (node instanceof HTMLElement) {
            elements.push(node)
        }
        node = result.iterateNext()
    }
    
    return elements
}

async function getStorageData(key, defaultValue = null) {
    return new Promise(resolve => {
        chrome.storage.local.get(key, (result) => {
            resolve(result[key] ?? defaultValue);
        });
    });
}

async function setStorageData(key, value) {
    return new Promise(resolve => {
        chrome.storage.local.set({ [key]: value }, () => {
            resolve();
        });
    });
}

async function updateStorageArray(key, updateFn) {
    const data = await getStorageData(key, []);
    const updatedData = updateFn(data);
    await setStorageData(key, updatedData);
}

function sendMessage(action, data = {}) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action, data }, resolve);
    });
}

