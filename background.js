let currentInputFieldConfigs = []

function deleteInputFieldConfig(placeholder) {
	chrome.storage.local.get(['inputFieldConfigs'], result => {
		const inputFieldConfigs = result?.inputFieldConfigs || []
		const configIndex = inputFieldConfigs.findIndex(config => config.placeholderIncludes === placeholder)
		if (configIndex !== -1) {
			inputFieldConfigs.splice(configIndex, 1)
		} else {
			return
		}
		chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
			currentInputFieldConfigs = inputFieldConfigs
		})
	})
}

async function saveLinkedInJobData(jobTitle, jobLink, companyName) {
	const storageResult = await chrome.storage.local.get('externalApplyData')
	const storedData = storageResult?.externalApplyData || []
	storedData.push({ title: jobTitle, link: jobLink, companyName, time: Date.now() })
	
	const uniqData = []
	const seenLinks = new Set()
	const seenTitleAndCompany = new Set()
	for (const item of storedData) {
		const uniqKeyLink = `${item.link}`
		const uniqKeyTitleName = `${item.title}-${item.companyName}`
		
		if (!seenLinks.has(uniqKeyLink) && !seenTitleAndCompany.has(uniqKeyTitleName)) {
			seenLinks.add(uniqKeyLink)
			seenTitleAndCompany.add(uniqKeyTitleName)
			uniqData.push(item)
		}
	}
	
	const sortedData = uniqData.sort((a, b) => b.time - a.time)
	await chrome.storage.local.set({ 'externalApplyData': sortedData })
}

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
	Error.captureStackTrace(error, logTrace);
	console.trace(error);
};


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	try {
		if (request.action === 'externalApplyAction') {
			const { jobTitle, currentPageLink, companyName } = request.data
			saveLinkedInJobData(jobTitle, currentPageLink, companyName)
				.then(() => {
					sendResponse({ success: true })
				}).catch(() => {
				sendResponse({ success: false })
			})
			return true
		} else if (request.action === 'openDefaultInputPage') {
			chrome.tabs.create({ url: 'popup/formControl/formControl.html' })
		} else if (request.action === 'startAutoApply') {
			try {
				chrome.tabs.query({ active: true, currentWindow: true })
					.then(tabs => {
						if (!tabs?.[0]) {
							sendResponse({ success: false, message: 'No active tab found.' })
							return true
						}
						const currentTabId = tabs?.[0]?.id
						const currentUrl = tabs?.[0]?.url || ''
						chrome.storage.local.get('defaultFields', storageResult => {
							if (storageResult?.defaultFields) {
								if (!storageResult?.defaultFields) {
									sendResponse({ success: false, message: 'Default fields are not set.' })
									return true
								}
								const result = storageResult.defaultFields
								const isDefaultFieldsEmpty = Object.values(result).some(value => value === '')
								if (!currentUrl.includes('linkedin.com/jobs')) {
									chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' })
										.then(() => sendResponse({
											success: false,
											message: 'You are not on the LinkedIn jobs search page.'
										}))
										.catch(err => {
											console.error('Error sending showNotOnJobSearchAlert in [startAutoApply (action)]:', err)
											sendResponse({
												success: false,
												message: 'Error showing alert: ' + err.message
											})
										})
									return true
								}
								if (isDefaultFieldsEmpty) {
									chrome.tabs.sendMessage(currentTabId, { action: 'showFormControlAlert' })
										.then(() => sendResponse({
											success: false,
											message: 'Form control fields are empty.  Please set them in the extension options.'
										}))
										.catch(err => {
											logTrace('Error sending showFormControlAlert: ', err?.message)
											sendResponse({ success: false, message: 'Error showing form control alert: ' + err.message })
										})
									return true
								}
								if (currentUrl.includes('linkedin.com/jobs') && !isDefaultFieldsEmpty) {
									chrome.tabs.sendMessage(currentTabId, { action: 'showRunningModal' })
										.then(response => {
											if (response && response.success) {
												chrome.scripting.executeScript({
													target: { tabId: currentTabId },
													func: runScriptInContent
												}).then(() => {
													sendResponse({ success: true })
												}).catch(err => {
													logTrace('startAutoApply Error: ', err?.message)
													sendResponse({ success: false, message: err.message })
													chrome.tabs.sendMessage(currentTabId, { action: 'hideRunningModal' })
												})
											} else {
												logTrace('log','Failed to show running modal: ', response)
												sendResponse({ success: false, message: 'Failed to show running modal.' })
											}
										}).catch(err => {
										logTrace('Error sending showRunningModal : ', err?.message)
										sendResponse({ success: false, message: 'Failed to send showRunningModal: ' + err.message })
									})
									return true
								}
							}
						})
						return true
					})
				return true
			} catch (err) {
				logTrace('startAutoApply Error: ', err?.message)
				sendResponse({ success: false, message: err.message })
			}
		} else if (request.action === 'stopAutoApply') {
			chrome.storage.local.set({ 'autoApplyRunning': false }, () => {
				chrome.tabs.query({ active: true, currentWindow: true })
					.then(tabs => {
						if (!tabs?.[0]) {
							sendResponse({ success: false, message: 'No active tab found.' })
							return
						}
						const currentTabId = tabs[0].id
						chrome.tabs.get(currentTabId, (tab) => {
							if (chrome.runtime.lastError) {
								logTrace('Error getting tab info:', chrome.runtime.lastError.message)
								sendResponse({ success: false, message: 'Tab error: ' + chrome.runtime.lastError.message })
								return
							}
							
							if (!tab || !tab.url || !tab.url.includes('linkedin.com/jobs')) {
								logTrace('warn','Tab is invalid or URL does not match.')
								sendResponse({ success: false, message: 'Tab is invalid or not a LinkedIn jobs page.' })
								return
							}
							
							chrome.tabs.sendMessage(currentTabId, { action: 'hideRunningModal' })
								.then(response => {
									if (response && response.success) {
										sendResponse({ success: true })
									} else {
										sendResponse({ success: false, message: 'Failed to hide modal on stop.' })
									}
								}).catch(err => {
								logTrace('Error sending hideRunningModal:', err?.message)
								sendResponse({ success: false, message: 'Failed to send hideRunningModal: ' + err?.message })
							})
						})
					}).catch(err => {
					logTrace('Error querying tabs in stopAutoApply:', err?.message)
					sendResponse({ success: false, message: 'Error querying tabs: ' + err?.message})
				})
				return true
			})
			return true
		} else if (request.action === 'openTabAndRunScript') {
			chrome.tabs.create({ url: request.url }, (tab) => {
				chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
					if (tabId === tab.id && changeInfo.status === 'complete') {
						chrome.tabs.sendMessage(tabId, { action: 'showRunningModal' })
							.then(response => {
								if (response && response.success) {
									chrome.scripting.executeScript({
										target: { tabId: tabId },
										func: runScriptInContent
									}).then(() => {
										sendResponse({ success: true })
									}).catch(err => {
										logTrace('executeScript error:', err)
										sendResponse({ success: false, message: err.message })
										chrome.tabs.sendMessage(tabId, { action: 'hideRunningModal' })
									})
								} else {
									logTrace('Failed to show running modal: ', response.message)
									sendResponse({ success: false, message: response?.message || 'Failed to show running modal.' })
								}
							}).catch(err => {
							logTrace('Error sending showRunningModal:', err?.message)
							sendResponse({ success: false, message: 'Failed to send showRunningModal: ' + err?.message })
						})
						
						chrome.tabs.onUpdated.removeListener(listener)
					}
				})
			})
			return true
		} else if (request.action === 'updateInputFieldValue') {
			const { placeholder, value } = request.data;
			updateOrAddInputFieldValue(placeholder, value)
				.then(() => sendResponse({success: true}))
				.catch(err => {
					logTrace("Error in updateInputFieldValue:", err?.message);
					sendResponse({success: false, message: err?.message});
				});
			return true;
		} else if (request.action === 'updateInputFieldConfigsInStorage') {
			const placeholder = request.data
			updateInputFieldConfigsInStorage(placeholder)
				.then(() => sendResponse({ success: true }))
				.catch(err => {
					logTrace('Error in updateInputFieldConfigsInStorage:', err?.message)
					sendResponse({ success: false, message: err?.message })
				})
			return true
		} else if (request.action === 'deleteInputFieldConfig') {
			const placeholder = request.data
			deleteInputFieldConfig(placeholder)
		} else if (request.action === 'getInputFieldConfig') {
			getInputFieldConfig(sendResponse)
			return true
		} else if (request.action === 'updateRadioButtonValueByPlaceholder') {
			updateRadioButtonValue(request.placeholderIncludes, request.newValue)
		} else if (request.action === 'deleteRadioButtonConfig') {
			deleteRadioButtonConfig(request.data)
		} else if (request.action === 'updateDropdownConfig') {
			const { placeholderIncludes, value } = request.data
			updateDropdownConfig(placeholderIncludes, value)
		} else if (request.action === 'deleteDropdownConfig') {
			deleteDropdownValueConfig(request.data)
		}
	} catch (e) {
		logTrace('onMessage error:', e)
		sendResponse({ success: false, message: e.message })
	}
})

async function updateOrAddInputFieldValue(placeholder, value) {
	try {
		const { inputFieldConfigs = [] } = await chrome.storage.local.get('inputFieldConfigs');
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder);
		
		if (foundConfig) {
			foundConfig.defaultValue = value;
		} else {
			const newConfig = { placeholderIncludes: placeholder, defaultValue: value, count: 1 };
			inputFieldConfigs.push(newConfig);
		}
		
		await chrome.storage.local.set({ inputFieldConfigs });
		
	} catch (error) {
		logTrace("Error updating or adding input field value:", error);
		throw error;
	}
}

async function updateInputFieldConfigsInStorage(placeholder) {
	const result = await chrome.storage.local.get(['inputFieldConfigs'])
	const inputFieldConfigs = result.inputFieldConfigs || []
	const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
	if (foundConfig) {
		foundConfig.count++
		chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
			currentInputFieldConfigs = inputFieldConfigs
		})
	} else {
		chrome.storage.local.get('defaultFields', function(result) {
			const defaultFields = result.defaultFields || {}
			const newConfig = { placeholderIncludes: placeholder, defaultValue: defaultFields.YearsOfExperience, count: 1 }
			inputFieldConfigs.push(newConfig)
			chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
				currentInputFieldConfigs = inputFieldConfigs
			})
		})
	}
	
	try {
		const { inputFieldConfigs = [] } = await chrome.storage.local.get('inputFieldConfigs')
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
		
		if (foundConfig) {
			foundConfig.count++
		} else {
			const { defaultFields = {} } = await chrome.storage.local.get('defaultFields')
			const newConfig = {
				placeholderIncludes: placeholder,
				defaultValue: defaultFields?.YearsOfExperience,
				count: 1
			}
			inputFieldConfigs.push(newConfig)
		}
		
		await chrome.storage.local.set({ inputFieldConfigs })
		
	} catch (error) {
		logTrace('Error updating input field configs:', error)
		throw error
	}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'deleteInputFieldConfig') {
		const placeholder = request.data
		deleteInputFieldConfig(placeholder)
	}
})

function getInputFieldConfig(callback) {
	try {
		chrome.storage.local.get(['inputFieldConfigs'], result => {
			const fieldConfig = result && result?.inputFieldConfigs ? result?.inputFieldConfigs : null
			callback(fieldConfig)
		})
	} catch (error) {
		callback(null)
	}
}

function updateRadioButtonValue(placeholderIncludes, newValue) {
	chrome.storage.local.get('radioButtons', (result) => {
		const storedRadioButtons = result.radioButtons || []
		const storedRadioButtonInfo = storedRadioButtons.find(info => info.placeholderIncludes === placeholderIncludes)
		if (storedRadioButtonInfo) {
			storedRadioButtonInfo.defaultValue = newValue
			storedRadioButtonInfo.options.forEach(option => {
				option.selected = option.value === newValue
			})
			chrome.storage.local.set({ 'radioButtons': storedRadioButtons }, () => {
			})
		} else {
			logTrace(`Item with placeholderIncludes ${placeholderIncludes} not found`)
		}
	})
}

function deleteRadioButtonConfig(placeholder) {
	chrome.storage.local.get('radioButtons', function(result) {
		const radioButtons = result.radioButtons || []
		const updatedRadioButtons = radioButtons.filter(config => config.placeholderIncludes !== placeholder)
		chrome.storage.local.set({ 'radioButtons': updatedRadioButtons })
	})
}

function updateDropdownConfig(dropdownData) {
	if (!dropdownData || !dropdownData.placeholderIncludes || !dropdownData.value || !dropdownData.options) {
		return
	}
	
	chrome.storage.local.get('dropdowns', function(result) {
		let dropdowns = result.dropdowns || []
		const storedDropdownInfo = dropdowns.find(info => info.placeholderIncludes === dropdownData.placeholderIncludes)
		if (storedDropdownInfo) {
			storedDropdownInfo.value = dropdownData.value
			storedDropdownInfo.options = dropdownData.options.map(option => ({
				value: option.value,
				text: option.text || '',
				selected: option.value === dropdownData.value
			}))
		} else {
			dropdowns.push({
				placeholderIncludes: dropdownData.placeholderIncludes,
				value: dropdownData.value,
				options: dropdownData.options.map(option => ({
					value: option.value,
					text: option.text || '',
					selected: option.value === dropdownData.value
				}))
			})
		}
		chrome.storage.local.set({ dropdowns })
	})
}


function deleteDropdownValueConfig(placeholder) {
	chrome.storage.local.get('dropdowns', function(result) {
		let dropdowns = result.dropdowns || []
		const indexToDelete = dropdowns.findIndex(config => config.placeholderIncludes === placeholder)
		if (indexToDelete !== -1) {
			dropdowns.splice(indexToDelete, 1)
			chrome.storage.local.set({ 'dropdowns': dropdowns })
		}
	})
}

// start stop auto apply
function runScriptInContent() {
	if (typeof runScript === 'function') {
		runScript()
	}
}
