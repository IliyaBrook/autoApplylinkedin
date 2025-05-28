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
											const errorMessage = err?.message || 'Unknown error'
											if (errorMessage.includes('establish connection')) return false;
											console.error('background script error:', errorMessage)
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
											console.trace('Error sending showFormControlAlert: ' + err?.message)
											sendResponse({ success: false, message: 'Error showing form control alert: ' + err.message })
										})
									return true
								}
								if (currentUrl.includes('linkedin.com/jobs') && !isDefaultFieldsEmpty) {
									chrome.scripting.executeScript({
										target: { tabId: currentTabId },
										func: runScriptInContent
									}).then(() => {
										sendResponse({ success: true })
									}).catch(err => {
										console.trace('startAutoApply Error: ' + err?.message)
										sendResponse({ success: false, message: err.message })
									})
								}
							}
						})
						return true
					})
				return true
			} catch (err) {
				console.trace('startAutoApply Error: ' + err?.message)
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
								console.trace('Error getting tab info:' + chrome?.runtime?.lastError?.message)
								sendResponse({ success: false, message: 'Tab error: ' + chrome.runtime.lastError.message })
								return
							}
							
							if (!tab || !tab.url || !tab.url.includes('linkedin.com/jobs')) {
								console.trace('Tab is invalid or URL does not match.')
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
								console.trace('Error sending hideRunningModal: ' + err?.message)
								sendResponse({ success: false, message: 'Failed to send hideRunningModal: ' + err?.message })
							})
						})
					}).catch(err => {
					console.trace('Error querying tabs in stopAutoApply:' + err?.message)
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
										console.trace('executeScript error:' + err?.message)
										sendResponse({ success: false, message: err.message })
										chrome.tabs.sendMessage(tabId, { action: 'hideRunningModal' })
									})
								} else {
									console.trace('Failed to show running modal: ' + response?.message)
									sendResponse({ success: false, message: response?.message || 'Failed to show running modal.' })
								}
							}).catch(err => {
							console.trace('Error sending showRunningModal: ' + err?.message)
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
					console.trace("Error in updateInputFieldValue: " + err?.message);
					sendResponse({success: false, message: err?.message});
				});
			return true;
		} else if (request.action === 'updateInputFieldConfigsInStorage') {
			const placeholder = request.data
			updateInputFieldConfigsInStorage(placeholder)
				.then(() => sendResponse({ success: true }))
				.catch(err => {
					console.trace('Error in updateInputFieldConfigsInStorage:' + err?.message)
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
			updateDropdownConfig(request.data)
		} else if (request.action === 'deleteDropdownConfig') {
			deleteDropdownValueConfig(request.data)
		} else if (request.action === 'checkAutoApplyStatus') {
			const tabId = request.tabId
			if (tabId) {
				chrome.tabs.sendMessage(tabId, { action: 'checkScriptRunning' })
					.then(response => {
						const isActuallyRunning = response?.isRunning || false
						chrome.storage.local.set({ autoApplyRunning: isActuallyRunning }, () => {
							sendResponse({ isRunning: isActuallyRunning })
						})
					})
					.catch(() => {
						chrome.storage.local.set({ autoApplyRunning: false }, () => {
							sendResponse({ isRunning: false })
						})
					})
			} else {
				chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
					sendResponse({ isRunning: Boolean(autoApplyRunning) })
				})
			}
			return true
		}
	} catch (e) {
		console.trace('onMessage error:' + e?.message)
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
		console.trace("Error updating or adding input field value:" + error?.message);
		throw error;
	}
}

async function updateInputFieldConfigsInStorage(placeholder) {
	try {
		const result = await chrome.storage.local.get('inputFieldConfigs')
		const inputFieldConfigs = result?.inputFieldConfigs || []
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
		if (foundConfig) {
			foundConfig.count++
			chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
				currentInputFieldConfigs = inputFieldConfigs
			})
			if (!('createdAt' in foundConfig) || !foundConfig.createdAt) {
				foundConfig.createdAt = Date.now();
			}
		}else {
			const newConfig = { placeholderIncludes: placeholder, defaultValue: '', count: 1, createdAt: Date.now() }
			inputFieldConfigs.push(newConfig)
			chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
				currentInputFieldConfigs = inputFieldConfigs
			})
		}
	} catch (error) {
		console.trace('Error updating input field configs: ' + error?.message)
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
			chrome.storage.local.set({ 'radioButtons': storedRadioButtons })
		} else {
			console.trace(`Item with placeholderIncludes ${placeholderIncludes} not found`)
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
			
			if (!('createdAt' in storedDropdownInfo) || !storedDropdownInfo.createdAt) {
				storedDropdownInfo.createdAt = Date.now();
			}
		} else {
			dropdowns.push({
				placeholderIncludes: dropdownData.placeholderIncludes,
				value: dropdownData.value,
				createdAt: Date.now(),
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


function runScriptInContent() {
	if (typeof runScript === 'function') {
		runScript()
	}
}
