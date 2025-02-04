import { getStorageData, setStorageData } from './utils/bgUtils.js'


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

async function saveLinkedInJobData(jobTitle, jobLink, companyName) {
	const storedData = await getStorageData('externalApplyData', [])
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
	
	await setStorageData('externalApplyData', sortedData)
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	try {
		(async () => {
			if (request.action === 'externalApplyAction') {
				const { jobTitle, currentPageLink, companyName } = request.data
				await saveLinkedInJobData(jobTitle, currentPageLink, companyName)
				sendResponse({ success: true })
			}
			if (request.action === 'initStorage') {
				const result = await getStorageData('inputFieldConfigs', []);
				currentInputFieldConfigs = (Array.isArray(result) && result.length > 0) ? result : [];
				sendResponse({ success: true });
			}
			if (request.action === 'startAutoApply') {
				try {
					const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
					
					if (!tabs?.[0]) {
						sendResponse({ success: false, message: 'No active tab found.' })
						return
					}
					
					const currentTabId = tabs[0].id
					const currentUrl = tabs[0].url || ''
					
					if (currentUrl.includes('linkedin.com/jobs')) {
						try {
							await chrome.scripting.executeScript({
								target: { tabId: currentTabId }, func: runScriptInContent
							})
							sendResponse({ success: true })
						} catch (err) {
							sendResponse({ success: false, message: err.message })
						}
					} else {
						await chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' })
						sendResponse({ success: false, message: 'You are not on the LinkedIn jobs search page.' })
					}
				} catch (err) {
					sendResponse({ success: false, message: err.message })
				}
			}
			if (request.action === 'stopAutoApply') {
				await setStorageData('autoApplyRunning', false)
				sendResponse({ success: true })
			}
			if (request.action === 'updateInputFieldValue') {
				const placeholder = request.data.placeholder
				const value = request.data.value
				await updateOrAddInputFieldValue(placeholder, value)
				sendResponse({ success: true })
			}
			if (request.action === 'updateInputFieldConfigsInStorage') {
				const placeholder = request.data
				await updateInputFieldConfigsInStorage(placeholder)
				sendResponse({ success: true })
			}
			if (request.action === 'deleteInputFieldConfig') {
				const placeholder = request.data
				await deleteInputFieldConfig(placeholder)
				sendResponse({ success: true })
			}
			if (request.action === 'getInputFieldConfig') {
				await getInputFieldConfig(sendResponse)
				sendResponse({ success: true })
			}
			if (request.action === 'updateRadioButtonValueByPlaceholder') {
				await updateRadioButtonValue(request.placeholderIncludes, request.newValue)
				sendResponse({ success: true })
			}
			if (request.action === 'deleteRadioButtonConfig') {
				await deleteRadioButtonConfig(request.data)
				sendResponse({ success: true })
			}
			if (request.action === 'updateDropdownConfig') {
				const { placeholderIncludes, value } = request.data
				await updateDropdownConfig(placeholderIncludes, value)
				sendResponse({ success: true })
			}
			if (request.action === 'deleteDropdownConfig') {
				await deleteDropdownValueConfig(request.data)
				sendResponse({ success: true })
			}
			if (request.action === 'openDefaultInputPage') {
				await chrome.tabs.create({ url: 'components/defaultInput/defaultInput.js' })
				sendResponse({ success: true })
			}
		})()
	} catch (e) {
		console.error('[onMessage] error:', e)
		sendResponse({ success: false, message: e.message })
	}
	return true
})

async function updateOrAddInputFieldValue(placeholder, value) {
	const inputFieldConfigs = await getStorageData('inputFieldConfigs', [])
	const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
	if (foundConfig) {
		foundConfig.defaultValue = value
		await setStorageData('inputFieldConfigs', inputFieldConfigs)
		currentInputFieldConfigs = inputFieldConfigs
	} else {
		const newConfig = { placeholderIncludes: placeholder, defaultValue: value, count: 1 }
		inputFieldConfigs.push(newConfig)
		await setStorageData('inputFieldConfigs', inputFieldConfigs)
		currentInputFieldConfigs = inputFieldConfigs
	}
}

async function updateInputFieldConfigsInStorage(placeholder) {
	const inputFieldConfigs = await getStorageData('inputFieldConfigs', [])
	
	const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder)
	
	if (foundConfig) {
		foundConfig.count++
	} else {
		const defaultFields = await getStorageData('defaultFields', {})
		const newConfig = {
			placeholderIncludes: placeholder, defaultValue: defaultFields.YearsOfExperience || '', count: 1
		}
		inputFieldConfigs.push(newConfig)
	}
	
	await setStorageData('inputFieldConfigs', inputFieldConfigs)
	currentInputFieldConfigs = inputFieldConfigs
}

async function deleteInputFieldConfig(placeholder) {
	const inputFieldConfigs = getStorageData('inputFieldConfigs', [])
	const configIndex = inputFieldConfigs.findIndex(config => config.placeholderIncludes === placeholder)
	
	if (configIndex !== -1) {
		inputFieldConfigs.splice(configIndex, 1)
	} else {
		console.error(`Configuration for ${placeholder} not found. Unable to delete.`)
		return
	}
	
	await setStorageData('inputFieldConfigs', inputFieldConfigs)
	currentInputFieldConfigs = inputFieldConfigs
}

async function getInputFieldConfig(callback) {
	try {
		const fieldResult = await getStorageData('inputFieldConfigs', [])
		if (fieldResult) {
			callback(fieldResult)
		}
	} catch (error) {
		console.error('Error fetching inputFieldConfigs:', error)
		callback(null)
	}
}

async function updateRadioButtonValue(placeholderIncludes, newValue) {
	const storedRadioButtons = await getStorageData('radioButtons', [])
	const storedRadioButtonInfo = storedRadioButtons.find(info => info.placeholderIncludes === placeholderIncludes)
	if (storedRadioButtonInfo) {
		storedRadioButtonInfo.defaultValue = newValue
		storedRadioButtonInfo.options.forEach(option => {
			option.selected = (option.value === newValue)
		})
		await setStorageData('radioButtons', storedRadioButtons)
	} else {
		console.error(`Item with placeholderIncludes ${placeholderIncludes} not found`)
	}
}

async function deleteRadioButtonConfig(placeholder) {
	const radioButtons = await getStorageData('radioButtons', [])
	const updatedRadioButtons = radioButtons.filter(config => config.placeholderIncludes !== placeholder)
	await setStorageData('radioButtons', updatedRadioButtons)
}

async function updateDropdownConfig(placeholderIncludes, newValue) {
	const dropdowns = await getStorageData('dropdowns', [])
	const storedDropdownInfo = dropdowns.find(info => info.placeholderIncludes === placeholderIncludes)
	if (storedDropdownInfo && storedDropdownInfo.options) {
		storedDropdownInfo.options.forEach(option => {
			option.selected = (option.value === newValue)
		})
	}
	await setStorageData('dropdowns', dropdowns)
}

async function deleteDropdownValueConfig(placeholder) {
	const dropdowns = await getStorageData('dropdowns', [])
	const indexToDelete = dropdowns.findIndex(config => config.placeholderIncludes === placeholder)
	
	if (indexToDelete !== -1) {
		dropdowns.splice(indexToDelete, 1)
		await setStorageData('dropdowns', dropdowns)
	}
}

// start stop auto apply
function runScriptInContent() {
	if (typeof runScript === 'function') {
		runScript()
	}
}
