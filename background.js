const inputFieldConfigs = []
let currentInputFieldConfigs = []

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

function saveLinkedInJobData(jobTitle, jobLink) {
	chrome.storage.local.get(['externalApplyData'], (res) => {
		const storedData = res.externalApplyData || []
		storedData.push({ title: jobTitle, link: jobLink })
		chrome.storage.local.set({ externalApplyData: storedData })
	})
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	const currentUrl = tab.url
	if (currentUrl && currentUrl.startsWith('http')) {
		chrome.storage.local.set({ currentUrl }, () => {
		})
	}
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'externalApplyAction') {
		const { jobTitle, currentPageLink } = request.data
		saveLinkedInJobData(jobTitle, currentPageLink)
	  sendResponse({ success: true });
	}
	if (request.action === 'startAutoApply') {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs?.[0]) {
				const currentTabId = tabs[0].id;
				const currentUrl = tabs[0].url || '';
				
				if (currentUrl.includes('linkedin.com/jobs')) {
					chrome.scripting.executeScript({
						target: { tabId: currentTabId },
						func: runScriptInContent,
					}, () => {
						if (chrome.runtime.lastError) {
							console.error('Error running script:', chrome.runtime.lastError);
							sendResponse({ success: false, message: chrome.runtime.lastError.message });
						} else {
							sendResponse({ success: true });
						}
					});
				} else {
					chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' }, (response) => {
						if (chrome?.runtime?.lastError) {
							console.error('Error sending message to content script:', chrome.runtime.lastError);
						}
					});
					sendResponse({ success: false, message: 'You are not on the LinkedIn jobs search page.' });
				}
			} else {
				sendResponse({ success: false, message: 'No active tab found.' });
			}
		});
		return true;
	} else if (request.action === 'stopAutoApply') {
		chrome.storage.local.set({ autoApplyRunning: false })
		sendResponse({ success: true })
	} else if (request.action === 'initStorage') {
		chrome.storage.local.get(['inputFieldConfigs'], result => {
			if (!result.inputFieldConfigs) {
				chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
					currentInputFieldConfigs = inputFieldConfigs
				})
			} else {
				currentInputFieldConfigs = result.inputFieldConfigs
			}
		})
	} else if (request.action === 'updateInputFieldValue') {
		const placeholder = request.data.placeholder
		const value = request.data.value
		updateOrAddInputFieldValue(placeholder, value)
	} else if (request.action === 'updateInputFieldConfigsInStorage') {
		const placeholder = request.data
		updateInputFieldConfigsInStorage(placeholder)
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
	} else if (request.action === 'openDefaultInputPage') {
		chrome.tabs.create({ url: 'components/defaultInput/defaultInput.js' })
	}
	
	return true
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
			chrome.storage.local.get('defaultFields', function(res2) {
				const defaultFields = res2.defaultFields || {}
				const newConfig = {
					placeholderIncludes: placeholder,
					defaultValue: defaultFields.YearsOfExperience,
					count: 1
				}
				inputFieldConfigs.push(newConfig)
				chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
					currentInputFieldConfigs = inputFieldConfigs
				})
			})
		}
	})
}

function deleteInputFieldConfig(placeholder) {
	chrome.storage.local.get(['inputFieldConfigs'], result => {
		const inputFieldConfigs = result.inputFieldConfigs || []
		const configIndex = inputFieldConfigs.findIndex(config => config.placeholderIncludes === placeholder)
		
		if (configIndex !== -1) {
			inputFieldConfigs.splice(configIndex, 1)
		} else {
			console.error(`Configuration for ${placeholder} not found. Unable to delete.`)
			return
		}
		chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
			currentInputFieldConfigs = inputFieldConfigs
		})
	})
}

function getInputFieldConfig(callback) {
	try {
		chrome.storage.local.get(['inputFieldConfigs'], result => {
			const fieldConfig = (result && result.inputFieldConfigs) ? result.inputFieldConfigs : null
			callback(fieldConfig)
		})
	} catch (error) {
		console.error('Error fetching inputFieldConfigs:', error)
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
				option.selected = (option.value === newValue)
			})
			chrome.storage.local.set({ 'radioButtons': storedRadioButtons })
		} else {
			console.error(`Item with placeholderIncludes ${placeholderIncludes} not found`)
		}
	})
}

function deleteRadioButtonConfig(placeholder) {
	chrome.storage.local.get('radioButtons', function(result) {
		const radioButtons = result.radioButtons || []
		const updatedRadioButtons = radioButtons.filter(config => config.placeholderIncludes !== placeholder)
		
		chrome.storage.local.set({'radioButtons': updatedRadioButtons })
	})
}

function updateDropdownConfig(placeholderIncludes, newValue) {
	chrome.storage.local.get('dropdowns', function(result) {
		let dropdowns = result.dropdowns || []
		const storedDropdownInfo = dropdowns.find(info => info.placeholderIncludes === placeholderIncludes)
		if (storedDropdownInfo && storedDropdownInfo.options) {
			storedDropdownInfo.options.forEach(option => {
				option.selected = (option.value === newValue)
			})
		}
		chrome.storage.local.set({ 'dropdowns': dropdowns })
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

function clearAllLinkedInJobData() {
	chrome.storage.local.set({ externalApplyData: [] })
}

// start stop auto apply

function runScriptInContent() {
	if (typeof runScript === 'function') {
		runScript()
	}
}
