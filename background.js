import { getStorageData, sendMessage, setStorageData } from './utils/bgUtils.js'


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
	const storedData = await getStorageData('externalApplyData', []);
	storedData.push({ title: jobTitle, link: jobLink, companyName, time: Date.now() });
	
	const uniqData = [];
	const seenLinks = new Set();
	const seenTitleAndCompany = new Set();
	for (const item of storedData) {
		const uniqKeyLink = `${item.link}`;
		const uniqKeyTitleName = `${item.title}-${item.companyName}`;
		
		if (!seenLinks.has(uniqKeyLink) && !seenTitleAndCompany.has(uniqKeyTitleName)) {
			seenLinks.add(uniqKeyLink);
			seenTitleAndCompany.add(uniqKeyTitleName);
			uniqData.push(item);
		}
	}
	
	const sortedData = uniqData.sort((a, b) => b.time - a.time);
	
	await setStorageData('externalApplyData', sortedData);
}

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
// 	let responded = false;
// 	(async () => {
// 		try {
// 			if (request.action === 'externalApplyAction') {
// 				console.log(`[onMessage] externalApplyAction started`);
// 				const { jobTitle, currentPageLink, companyName } = request.data;
// 				sendResponse({ success: true });
// 				responded = true;
// 				await saveLinkedInJobData(jobTitle, currentPageLink, companyName);
// 				console.log(`[onMessage] externalApplyAction done`);
// 				return;
// 			}
// 			if (request.action === 'initStorage') {
// 				console.log(`[onMessage] initStorage started`);
// 				sendResponse({ success: true });
// 				responded = true;
//
// 				const storedConfigs = await getStorageData('inputFieldConfigs', []);
//
// 				if (!storedConfigs.length) {
// 					await setStorageData('inputFieldConfigs', inputFieldConfigs);
// 					currentInputFieldConfigs = inputFieldConfigs;
// 				} else {
// 					currentInputFieldConfigs = storedConfigs;
// 				}
// 				console.log(`[onMessage] initStorage done`);
// 				return;
// 			}
// 			if (request.action === 'startAutoApply') {
// 				console.log("[onMessage] startAutoApply started");
// 				sendResponse({ success: true });
// 				responded = true;
//
// 				const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
//
// 				if (chrome.runtime.lastError) {
// 					console.error("[onMessage] startAutoApply error:", chrome.runtime.lastError.message);
// 					return;
// 				}
//
// 				if (tabs?.[0]) {
// 					const currentTabId = tabs[0].id;
// 					const currentUrl = tabs[0].url || '';
//
// 					if (currentUrl.includes('linkedin.com/jobs')) {
// 						await chrome.scripting.executeScript({
// 							target: { tabId: currentTabId },
// 							func: runScriptInContent
// 						});
// 						console.log("[onMessage] startAutoApply done");
// 					} else {
// 						await chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' });
// 						console.log("[onMessage] startAutoApply failed");
// 					}
// 				} else {
// 					console.log("[onMessage] startAutoApply failed: No active tab");
// 				}
// 				return;
// 			}
// 			if (request.action === 'stopAutoApply') {
// 				console.log("[onMessage] stopAutoApply started");
// 				sendResponse({ success: true });
// 				responded = true;
//
// 				await setStorageData('autoApplyRunning', false);
// 				console.log("[onMessage] stopAutoApply done");
// 				return;
// 			}
// 			if (request.action === 'updateInputFieldValue') {
// 				console.log("[onMessage] updateInputFieldValue started");
// 				const { placeholder, value } = request.data;
// 				sendResponse({ success: true });
// 				responded = true;
// 				await updateOrAddInputFieldValue(placeholder, value);
// 				console.log("[onMessage] updateInputFieldValue done");
// 				return;
// 			}
// 			if (request.action === 'updateInputFieldConfigsInStorage') {
// 				console.log("[onMessage] updateInputFieldConfigsInStorage started");
// 				const placeholder = request.data;
// 				sendResponse({ success: true });
// 				responded = true;
// 				await updateInputFieldConfigsInStorage(placeholder);
// 				console.log("[onMessage] updateInputFieldConfigsInStorage done");
// 				return;
// 			}
// 			if (request.action === 'deleteInputFieldConfig') {
// 				console.log("[onMessage] deleteInputFieldConfig started");
// 				const placeholder = request.data;
// 				sendResponse({ success: true });
// 				responded = true;
// 				await deleteInputFieldConfig(placeholder);
// 				console.log("[onMessage] deleteInputFieldConfig done");
// 				return;
// 			}
// 			if (request.action === 'getInputFieldConfig') {
// 				console.log("[onMessage] getInputFieldConfig started");
// 				getInputFieldConfig().then((config) => {
// 					console.log("[onMessage] getInputFieldConfig done");
// 					if (!responded) sendResponse({ success: true, data: config });
// 				}).catch((error) => {
// 					console.error("[onMessage] getInputFieldConfig error:", error);
// 					if (!responded) sendResponse({ success: false, error: error.message });
// 				});
// 				return true;
// 			}
// 			if (request.action === 'updateRadioButtonValueByPlaceholder') {
// 				console.log("[onMessage] updateRadioButtonValueByPlaceholder started");
// 				sendResponse({ success: true });
// 				responded = true;
// 				await updateRadioButtonValue(request.placeholderIncludes, request.newValue);
// 				console.log("[onMessage] updateRadioButtonValueByPlaceholder done");
// 				return;
// 			}
// 			if (request.action === 'deleteRadioButtonConfig') {
// 				console.log("[onMessage] deleteRadioButtonConfig started");
// 				sendResponse({ success: true });
// 				responded = true;
// 				await deleteRadioButtonConfig(request.data);
// 				console.log("[onMessage] deleteRadioButtonConfig done");
// 				return;
// 			}
// 			if (request.action === 'updateDropdownConfig') {
// 				console.log("[onMessage] updateDropdownConfig started");
// 				const { placeholderIncludes, value } = request.data;
// 				sendResponse({ success: true });
// 				responded = true;
// 				await updateDropdownConfig(placeholderIncludes, value);
// 				console.log("[onMessage] updateDropdownConfig done");
// 				return;
// 			}
// 			if (request.action === 'deleteDropdownConfig') {
// 				console.log("[onMessage] deleteDropdownConfig started");
// 				sendResponse({ success: true });
// 				responded = true;
// 				await deleteDropdownValueConfig(request.data);
// 				console.log("[onMessage] deleteDropdownConfig done");
// 				return;
// 			}
// 			if (request.action === 'openDefaultInputPage') {
// 				console.log("[onMessage] openDefaultInputPage started");
// 				chrome.tabs.create({ url: 'components/defaultInput/defaultInput.js' })
// 					.then(() => {
// 						console.log("[onMessage] openDefaultInputPage done");
// 						if (!responded) sendResponse({ success: true });
// 					})
// 					.catch((error) => {
// 						console.error("[onMessage] openDefaultInputPage error:", error);
// 						if (!responded) sendResponse({ success: false, error: error.message });
// 					});
// 				return true;
// 			}
// 			console.error("[onMessage] Unknown action:", request.action);
// 			if (!responded) sendResponse({ success: false, message: 'Unknown action' });
// 		} catch (error) {
// 			console.error("[onMessage] error:", error);
// 			if (!responded) sendResponse({ success: false, error: error.message });
// 		}
// 	})();
//
// 	return true;
// });


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'externalApplyAction') {
		const { jobTitle, currentPageLink, companyName } = request.data
		saveLinkedInJobData(jobTitle, currentPageLink, companyName)
		sendResponse({ success: true })
	}
	if (request.action === 'initStorage') {
		chrome.storage.local.get(['inputFieldConfigs'], result => {
			if (!result.inputFieldConfigs) {
				chrome.storage.local.set({ 'inputFieldConfigs': inputFieldConfigs }, () => {
					currentInputFieldConfigs = inputFieldConfigs;
					sendResponse({ success: true });
				});
			} else {
				currentInputFieldConfigs = result.inputFieldConfigs;
				sendResponse({ success: true });
			}
		});
		return true;
	}
	if (request.action === 'startAutoApply') {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (chrome.runtime.lastError) {
				sendResponse({ success: false, message: chrome.runtime.lastError.message })
				return
			}
			if (tabs?.[0]) {
				const currentTabId = tabs[0].id
				const currentUrl = tabs[0].url || ''
				
				if (currentUrl.includes('linkedin.com/jobs')) {
					chrome.scripting.executeScript({
						target: { tabId: currentTabId },
						func: runScriptInContent
					}, () => {
						if (chrome.runtime.lastError) {
							sendResponse({ success: false, message: chrome.runtime.lastError.message })
						} else {
							sendResponse({ success: true })
						}
					})
				} else {
					chrome.tabs.sendMessage(currentTabId, { action: 'showNotOnJobSearchAlert' })
					sendResponse({ success: false, message: 'You are not on the LinkedIn jobs search page.' })
				}
			} else {
				sendResponse({ success: false, message: 'No active tab found.' })
			}
		})
		return true
	} else if (request.action === 'stopAutoApply') {
		chrome.storage.local.set({ autoApplyRunning: false })
		sendResponse({ success: true })
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


async function updateOrAddInputFieldValue(placeholder, value) {
	const inputFieldConfigs = await getStorageData('inputFieldConfigs', [])
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
}

async function updateInputFieldConfigsInStorage(placeholder) {
	const inputFieldConfigs = await getStorageData('inputFieldConfigs', []);
	
	const foundConfig = inputFieldConfigs.find(config => config.placeholderIncludes === placeholder);
	
	if (foundConfig) {
		foundConfig.count++;
	} else {
		const defaultFields = await getStorageData('defaultFields', {});
		const newConfig = {
			placeholderIncludes: placeholder,
			defaultValue: defaultFields.YearsOfExperience || '',
			count: 1
		};
		inputFieldConfigs.push(newConfig);
	}
	
	await setStorageData('inputFieldConfigs', inputFieldConfigs);
	currentInputFieldConfigs = inputFieldConfigs;
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
