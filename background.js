import { getStorageData, setStorageData } from './utils/bgUtils.js'

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

function saveLinkedInJobData(jobTitle, jobLink, companyName) {
	getStorageData('externalApplyData', [], storedData => {
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
		
		setStorageData('externalApplyData', sortedData)
	})
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	try {
		if (request.action === 'externalApplyAction') {
			const { jobTitle, currentPageLink, companyName } = request.data
			saveLinkedInJobData(jobTitle, currentPageLink, companyName)
			sendResponse({ success: false })
		}
		if (request.action === 'startAutoApply') {
			try {
				chrome.tabs.query({ active: true, currentWindow: true })
					.then(tabs => {
						if (!tabs?.[0]) {
							sendResponse({ success: false, message: 'No active tab found.' })
							return
						}
						
						const currentTabId = tabs?.[0]?.id
						const currentUrl = tabs?.[0]?.url || ''
						getStorageData('defaultFields', [], result => {
							const isDefaultFieldsEmpty = Object.values(result).some(value => value === '')
							
							if (!currentUrl.includes('linkedin.com/jobs')) {
								void chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' })
								sendResponse({ success: false, message: 'You are not on the LinkedIn jobs search page.' })
							}
							if (isDefaultFieldsEmpty) {
								chrome.tabs.sendMessage(currentTabId, { action: 'showFormControlAlert' })
								sendResponse({
									success: false,
									message: 'Form control fields are empty. Please set them in the extension options.'
								})
							}
							if (currentUrl.includes('linkedin.com/jobs') && !isDefaultFieldsEmpty) {
								chrome.scripting.executeScript({
									target: { tabId: currentTabId }, func: runScriptInContent
								}).then(() => {
									sendResponse({ success: true })
								}).catch(err => {
									console.error('[startAutoApply] in bg error (executeScript): Error:', err);
									sendResponse({ success: false, message: err.message })
								})
							}
						})
					})
			} catch (err) {
				console.error('[startAutoApply] in bg error:', err)
				sendResponse({ success: false, message: err.message })
			}
		}
		if (request.action === 'stopAutoApply') {
			setStorageData('autoApplyRunning', false)
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
	return true
})

function updateOrAddInputFieldValue(placeholder, value) {
	getStorageData('inputFieldConfigs', [], inputFieldConfigs => {
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
		if (foundConfig) {
			foundConfig.defaultValue = value
			setStorageData('inputFieldConfigs', inputFieldConfigs)
		} else {
			const newConfig = { placeholderIncludes: placeholder, defaultValue: value, count: 1 }
			inputFieldConfigs.push(newConfig)
			setStorageData('inputFieldConfigs', inputFieldConfigs)
		}
	})
}

function updateInputFieldConfigsInStorage(placeholder) {
	getStorageData('inputFieldConfigs', [], inputFieldConfigs => {
		const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
		if (foundConfig) {
			foundConfig.count++
		} else {
			getStorageData('defaultFields', {}, defaultFields => {
				const newConfig = {
					placeholderIncludes: placeholder, defaultValue: defaultFields.YearsOfExperience || '', count: 1
				}
				inputFieldConfigs.push(newConfig)
			})
		}
		setStorageData('inputFieldConfigs', inputFieldConfigs)
	})
}

function deleteInputFieldConfig(placeholder) {
	getStorageData('inputFieldConfigs', [], inputFieldConfigs => {
		const configIndex = inputFieldConfigs.findIndex(config => config.placeholderIncludes === placeholder)
		
		if (configIndex !== -1) {
			inputFieldConfigs.splice(configIndex, 1)
		} else {
			console.error(`Configuration for ${placeholder} not found. Unable to delete.`)
			return
		}
		
		setStorageData('inputFieldConfigs', inputFieldConfigs)
	})
}

function getInputFieldConfig(callback) {
	try {
		getStorageData('inputFieldConfigs', [], fieldResult => {
			if (fieldResult) {
				callback(fieldResult)
			}
		})
	} catch (error) {
		console.error('Error fetching inputFieldConfigs:', error)
		callback(null)
	}
}

function updateRadioButtonValue(placeholderIncludes, newValue) {
	getStorageData('radioButtons', [], storedRadioButtons => {
		const storedRadioButtonInfo = storedRadioButtons.find(info => info.placeholderIncludes === placeholderIncludes)
		if (storedRadioButtonInfo) {
			storedRadioButtonInfo.defaultValue = newValue
			storedRadioButtonInfo.options.forEach(option => {
				option.selected = (option.value === newValue)
			})
			setStorageData('radioButtons', storedRadioButtons)
		} else {
			console.error(`Item with placeholderIncludes ${placeholderIncludes} not found`)
		}
	})

}

function deleteRadioButtonConfig(placeholder) {
	getStorageData('radioButtons', [], radioButtons => {
		const updatedRadioButtons = radioButtons.filter(config => config.placeholderIncludes !== placeholder)
		setStorageData('radioButtons', updatedRadioButtons)
	})
}

function updateDropdownConfig(placeholderIncludes, newValue) {
	getStorageData('dropdowns', [], dropdowns => {
		const storedDropdownInfo = dropdowns.find(info => info.placeholderIncludes === placeholderIncludes)
		if (storedDropdownInfo && storedDropdownInfo.options) {
			storedDropdownInfo.options.forEach(option => {
				option.selected = (option.value === newValue)
			})
		}
		setStorageData('dropdowns', dropdowns)
	})
}

function deleteDropdownValueConfig(placeholder) {
	getStorageData('dropdowns', [], dropdowns => {
		const indexToDelete = dropdowns.findIndex(config => config.placeholderIncludes === placeholder)
		if (indexToDelete !== -1) {
			dropdowns.splice(indexToDelete, 1)
			setStorageData('dropdowns', dropdowns)
		}
	})
}

// start stop auto apply
function runScriptInContent() {
	if (typeof runScript === 'function') {
		runScript()
	}
}
