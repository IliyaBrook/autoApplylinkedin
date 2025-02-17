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
 * @param {Document | HTMLElement | Element} [context=document | Element] - The context node to search within.
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