// noinspection DuplicatedCode

/**
 * Logs messages to the console using a specified logging level and outputs a stack trace.
 *
 * @param {'log'|'warn'|'error'} [logic='log'] - The logging level to use. Acceptable values are:
 *   - 'log': Logs the message using `console.log`.
 *   - 'warn': Logs the message using `console.warn`.
 *   - 'error': Logs the message using `console.error`.
 *   If no valid logging level is provided, it defaults to `console.error`.
 * @param {...any} messages - The messages, objects, or any other data to be logged.
 *   Multiple arguments can be passed, which will be logged sequentially.
 * @returns {void}
 */
const logTrace = (logic, ...messages) => {
	const log = (func) => messages.forEach(msg => func(msg));
	switch (logic) {
		case 'log':
			log(console.log)
			break;
		case 'warn':
			log(console.warn)
			break;
		case 'error':
			log(console.error)
			break;
		default:
			messages.unshift(logic)
			log(console.error)
	}
	const error = new Error();
	console.trace(error);
};

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
 * @param {string|Element|HTMLElement|HTMLElement[]|Element[]} options.elementOrSelector - A CSS selector string, a DOM element, or an array of elements.
 * @param {number} [options.timeout=5000] - Maximum waiting time in milliseconds.
 * @param {Document|Element|HTMLElement[]} [options.contextNode=document] - The node (Document, Element, or an array of Elements) to search within.
 * @returns {Promise<HTMLElement[]>} A promise that resolves with an array of visible elements,
 * or an empty array if none are found within the timeout.
 */
async function waitForElements({ elementOrSelector, timeout = 5000, contextNode = document }) {
	return new Promise(resolve => {
		try {
			const startTime = Date.now()
			
			const intervalId = setInterval(() => {
				let elements = []
				
				if (typeof elementOrSelector === 'string') {
					if (Array.isArray(contextNode)) {
						contextNode.forEach(node => {
							if (node instanceof Element) {
								elements.push(...node.querySelectorAll(elementOrSelector))
							}
						})
					} else {
						elements = contextNode.querySelectorAll(elementOrSelector)
					}
				} else if (elementOrSelector instanceof Element) {
					elements = [elementOrSelector]
				} else if (Array.isArray(elementOrSelector)) {
					elements = elementOrSelector.filter(el => el instanceof Element)
				} else {
					clearInterval(intervalId)
					resolve([])
					return
				}
				
				// const visibleElements = elements.filter(el => el.offsetParent !== null && el.isConnected);
				const visibleElements = []
				for (let i = 0; i < elements.length; i++) {
					if (elements[i].offsetParent !== null && elements[i].isConnected) {
						visibleElements.push(elements[i])
					}
				}
				
				if (visibleElements.length > 0) {
					clearInterval(intervalId)
					resolve(visibleElements)
					return
				}
				
				if (Date.now() - startTime > timeout) {
					clearInterval(intervalId)
					resolve([])
				}
			}, 100)
		} catch (e) {
			logTrace('Error in waitForElements: ', elementOrSelector)
		}
	})
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
	return new Promise(async resolve => {
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
					logTrace('log','No element found for selector: ', elementOrSelector)
					return
				}
			} else if (elementOrSelector instanceof Element) {
				element = elementOrSelector
			} else {
				logTrace('log', 'Argument must be a selector string or a DOM Element.')
				return
			}
			
			
			if (element.offsetParent === null || !element.isConnected) {
				logTrace('Element is not visible or not connected')
				return
			}
			element?.scrollIntoView({ block: 'center' })
			element.click()
			resolve(element)
			
		} catch (error) {
			logTrace('log','Element is not clickable:', error)
		}
	})
}

function normalizeString(str) {
	return str.toLowerCase().replace(/[\s-_]+/g, '');
}

function setNativeValue(element, value) {
	const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
	const prototype = Object.getPrototypeOf(element);
	const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
	if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
		prototypeValueSetter.call(element, value);
	} else if (valueSetter) {
		valueSetter.call(element, value);
	} else {
		throw new Error('Unable to set value')
	}
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

//Levenshtein distance
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
					matrix[i - 1][j - 1] + 1, // замена
					matrix[i][j - 1] + 1,     // вставка
					matrix[i - 1][j] + 1      // удаление
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
		if (normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
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
			const score = distance / Math.max(normalizedInput.length, normalizedKey.length);
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
		const score = distance / Math.max(normalizedInput.length, normalizedKey.length);
		if (score < bestScore) {
			bestScore = score;
			bestKey = key;
		}
	}
	return bestScore <= 0.4 ? defaultFields[bestKey] : undefined;
}