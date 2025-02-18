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

async function waitForElements(selector, timeout = 5000, contextNode = document) {
	return new Promise((resolve, reject) => {
		const startTime = Date.now()
		
		const intervalId = setInterval(() => {
			const elements = contextNode.querySelectorAll(selector)
			const visibleAndConnectedElements = []
			
			if (elements.length > 0) {
				for (let i = 0; i < elements.length; i++) {
					if (elements[i].offsetParent !== null && elements[i].isConnected) {
						visibleAndConnectedElements.push(elements[i])
					}
				}
				
				if (visibleAndConnectedElements.length > 0) {
					clearInterval(intervalId)
					resolve(visibleAndConnectedElements)
					return
				}
			}
			
			if (Date.now() - startTime > timeout) {
				clearInterval(intervalId)
				reject(new Error(`[waitForElements]: timeout exceeded: ${selector}`))
			}
		}, 50)
	})
}


async function clickElement(elementOrSelector, timeout = 5000, contextNode = document) {
	return new Promise(async (resolve, reject) => {
		try {
			let element
			if (typeof elementOrSelector === 'string') {
				const elements = await waitForElements(elementOrSelector, timeout, contextNode)
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
			
			element.click()
			resolve()
			
		} catch (error) {
			reject(error)
		}
	})
}