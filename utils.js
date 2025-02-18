async function addDelay(delay = 1000) {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve()
		}, delay)
	})
}

function getTime() {
	const now = new Date()
	const day = String(now.getDate()).padStart(2, '0')
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const year = String(now.getFullYear()).slice(-2)
	const hour = String(now.getHours()).padStart(2, '0')
	const minute = String(now.getMinutes()).padStart(2, '0')
	return { day, month, year, hour, minute }
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




/**
 * Waits for visible elements to appear in the DOM.
 *
 * @param {Object} options - Options for the wait operation.
 * @param {string|Element|HTMLElement} options.elementOrSelector - A CSS selector string or a DOM element.
 * @param {number} [options.timeout=5000] - Maximum waiting time in milliseconds.
 * @param {Document|Element} [options.contextNode=document] - The node (Document or Element) to search within.
 * @returns {Promise<Element[]>} A promise that resolves with an array of visible elements,
 * or an empty array if none are found within the timeout.
 */
async function waitForElements({ elementOrSelector, timeout = 5000, contextNode = document }) {
	return new Promise(resolve => {
		const startTime = Date.now();
		
		const intervalId = setInterval(() => {
			let elements = [];
			
			if (typeof elementOrSelector === 'string') {
				elements = contextNode.querySelectorAll(elementOrSelector);
			} else if (elementOrSelector instanceof Element) {
				elements = [elementOrSelector];
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
	});
}


/**
 * Waits for visible elements to appear in the DOM.
 *
 * @param {Object} options - Options for the wait operation.
 * @param {string|Element|HTMLElement} options.elementOrSelector - A CSS selector string or a DOM element.
 * @param {number} [options.timeout=5000] - Maximum waiting time in milliseconds.
 * @param {ParentNode} [options.contextNode=document] - The node to search within.
 * @returns {Promise<Element[]>} A promise that resolves with an array of visible elements,
 * or an empty array if none are found within the timeout.
 */
async function clickElement({ elementOrSelector, timeout = 5000, contextNode = document }) {
	return new Promise(async (resolve, reject) => {
		try {
			let element
			if (typeof elementOrSelector === 'string') {
				const elements = await waitForElements({
					elementOrSelector,
					timeout,
					contextNode
				})
				element = elements[0]
				if (!element) {
					reject(new Error(`[clickElement]: No element found for selector: ${elementOrSelector}`))
					return
				}
			} else if (elementOrSelector instanceof Element) {
				element = elementOrSelector
			} else {
				reject(new Error('[clickElement]: Argument must be a selector string or a DOM Element.'))
				return
			}
			
			
			if (element.offsetParent === null || !element.isConnected) {
				reject(new Error('[clickElement] Element is not visible or not connected'))
				return
			}
			element.scrollIntoView({ block: 'center' })
			element.click()
			resolve()
			
		} catch (error) {
			reject(error)
		}
	})
}