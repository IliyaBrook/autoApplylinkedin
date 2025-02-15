let currentInputFieldConfigs = []
const inputFieldConfigs = []

chrome.runtime.onConnect.addListener(function(port) {
	if (port.name === 'popup') {
		chrome.runtime.sendMessage({
			popup: true
		})
		
		port.onDisconnect.addListener(function() {
			chrome.runtime.sendMessage({
				popup: false
			})
		})
	}
})

chrome.runtime.onMessage.addListener((request) => {
	if (request.action === 'initStorage') {
		chrome.storage.local.get(['inputFieldConfigs'], result => {
			if (!result.inputFieldConfigs) {
				chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
					currentInputFieldConfigs = inputFieldConfigs
				})
			} else {
				currentInputFieldConfigs = result.inputFieldConfigs
			}
		})
	}
})

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

function saveLinkedInJobData(jobTitle, jobLink, companyName) {
	chrome.storage.local.get('externalApplyData', storageResult => {
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
		chrome.storage.local.set({ 'externalApplyData': sortedData })
	})
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	try {
		if (request.action === 'externalApplyAction') {
			const { jobTitle, currentPageLink, companyName } = request.data
			saveLinkedInJobData(jobTitle, currentPageLink, companyName)
			sendResponse({ success: false })
		}
		if (request.action === 'openDefaultInputPage') {
			chrome.tabs.create({ url: 'components/formControl/formControl.html' })
		}
		if (request.action === 'startAutoApply') {
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
								const result = storageResult.defaultFields
								const isDefaultFieldsEmpty = Object.values(result).some(value => value === '')
								if (!currentUrl.includes('linkedin.com/jobs')) {
									void chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' })
									sendResponse({ success: false, message: 'You are not on the LinkedIn jobs search page.' })
									return true
								}
								if (isDefaultFieldsEmpty) {
									chrome.tabs.sendMessage(currentTabId, { action: 'showFormControlAlert' })
									sendResponse({
										success: false,
										message: 'Form control fields are empty. Please set them in the extension options.'
									})
									return true
								}
								if (currentUrl.includes('linkedin.com/jobs') && !isDefaultFieldsEmpty) {
									chrome.scripting.executeScript({
										target: { tabId: currentTabId }, func: runScriptInContent
									}).then(() => {
										sendResponse({ success: true })
										return true
									}).catch(err => {
										console.error('[startAutoApply] in bg error (executeScript): Error:', err)
										sendResponse({ success: false, message: err.message })
									})
									return true
								}
							}
						})
						return true
					})
				return true
			} catch (err) {
				console.error('[startAutoApply] in bg error:', err)
				sendResponse({ success: false, message: err.message })
			}
		}
		if (request.action === 'openTabAndRunScript') {
			
			chrome.tabs.create({ url: request.url }, (tab) => {
				chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
					if (tabId === tab.id && changeInfo.status === 'complete') {
						chrome.scripting.executeScript({
							target: { tabId: tabId },
							func: runScriptInContent
						}).then(() => {
							sendResponse({ success: true });
						}).catch(err => {
							sendResponse({ success: false, message: err.message });
						});
						chrome.tabs.onUpdated.removeListener(listener);
					}
				});
			});
			return true;
		}
		if (request.action === 'stopAutoApply') {
			chrome.storage.local.set({ 'autoApplyRunning': false }, () => {
				sendResponse({ success: true })
			})
			return true
		}
		if (request.action === 'updateInputFieldValue') {
			const placeholder = request.data.placeholder
			const value = request.data.value
			updateOrAddInputFieldValue(placeholder, value)
		}
		if (request.action === 'updateInputFieldConfigsInStorage') {
			const placeholder = request.data
			updateInputFieldConfigsInStorage(placeholder)
		}
		if (request.action === 'deleteInputFieldConfig') {
			const placeholder = request.data
			deleteInputFieldConfig(placeholder)
		}
		if (request.action === 'getInputFieldConfig') {
			getInputFieldConfig(sendResponse)
			return true
		}
		if (request.action === 'updateRadioButtonValueByPlaceholder') {
			updateRadioButtonValue(request.placeholderIncludes, request.newValue)
		}
		if (request.action === 'deleteRadioButtonConfig') {
			deleteRadioButtonConfig(request.data)
		}
		if (request.action === 'updateDropdownConfig') {
			const { placeholderIncludes, value } = request.data
			updateDropdownConfig(placeholderIncludes, value)
		}
		if (request.action === 'deleteDropdownConfig') {
			deleteDropdownValueConfig(request.data)
		}
		
	} catch (e) {
		console.error('[onMessage] error:', e)
		sendResponse({ success: false, message: e.message })
	}
})

function updateOrAddInputFieldValue(placeholder, value) {
	chrome.storage.local.get(['inputFieldConfigs'], result => {
		const inputFieldConfigs = result.inputFieldConfigs || []
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
		if (foundConfig) {
			foundConfig.defaultValue = value
			chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
				currentInputFieldConfigs = inputFieldConfigs
			})
		} else {
			const newConfig = { placeholderIncludes: placeholder, defaultValue: value, count: 1 }
			inputFieldConfigs.push(newConfig)
			chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
				currentInputFieldConfigs = inputFieldConfigs
			})
		}
	})
}

function updateInputFieldConfigsInStorage(placeholder) {
	chrome.storage.local.get(['inputFieldConfigs'], result => {
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
	})
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
			console.error(`Item with placeholderIncludes ${placeholderIncludes} not found`)
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
