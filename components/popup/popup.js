const autoApplyButton = document.getElementById('start-auto-apply-button')
const startIcon = document.getElementById('start-icon')
const runningIcon = document.getElementById('running-icon')

const settingsButton = document.getElementById('form-control-button')
settingsButton.addEventListener('click', function() {
	chrome.tabs.create({ url: '/components/formControl/formControl.html' })
})

const filterSettingsButton = document.getElementById('filter-settings-button')
filterSettingsButton.addEventListener('click', function() {
	chrome.tabs.create({ url: '/components/filterSettings/filterSettings.html' })
})

// export settings button
document.getElementById('export-button').addEventListener('click', function() {
	chrome.storage.local.get(null, function(data) {
		const jsonData = JSON.stringify(data, null, 2)
		const blob = new Blob([jsonData], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		
		const link = document.createElement('a')
		link.href = url
		const { day, hour, minute, month } = getTime()
		link.download = `autoapply_settings_${day}_${month}_[${hour}_${minute}].json`
		link.click()
		
		URL.revokeObjectURL(url)
	})
})

function changeAutoApplyButton(isRunning) {
	if (isRunning) {
		autoApplyButton.classList.add('running');
		autoApplyButton.textContent = 'Stop Auto Apply';
		startIcon.style.display = 'none';
		runningIcon.style.display = 'inline';
	} else {
		autoApplyButton.classList.remove('running');
		autoApplyButton.textContent = 'Start Auto Apply';
		startIcon.style.display = 'inline';
		runningIcon.style.display = 'none';
	}
}

// import settings
document.getElementById('import-button').addEventListener('click', function() {
	document.getElementById('import-file').click()
})
// external apply links button
document.getElementById('external-apply-button').addEventListener('click', () => {
	chrome.tabs.create({ url: '/components/externalApply/externalApply.html' })
})

// parse file to local storage
document.getElementById('import-file').addEventListener('change', function(event) {
	const file = event.target.files[0]
	if (!file) return
	
	const reader = new FileReader()
	reader.onload = function(e) {
		try {
			const importedData = JSON.parse(e.target.result)
			chrome.storage.local.set(importedData, function() {
				alert('Settings imported successfully!')
			})
		} catch (err) {
			alert('Parsing error JSON. ' + err)
		}
	}
	reader.readAsText(file)
})

function ApplyButton(isRunning) {
	changeAutoApplyButton(isRunning);
}

autoApplyButton.addEventListener('click', () => {
	if (typeof chrome!== 'undefined' && chrome?.storage && chrome?.storage.local) {
		chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
			const newState =!autoApplyRunning;
			ApplyButton(newState);
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				const noActiveTabsText = 'No active tabs found try to go to a LinkedIn job search page or refresh the page.';
				if (tabs && tabs.length > 0) {
					const currentTabId = tabs?.id;
					
					chrome.runtime.sendMessage({
						action: newState? 'startAutoApply': 'stopAutoApply',
						tabId: currentTabId
					}, response => {
						if (response?.success) {
							chrome.storage.local.set({ autoApplyRunning: newState }, () => {
								console.log("Auto apply state updated in storage and UI (success response). New state:", newState);
							});
						} else {
							chrome.storage.local.set({ autoApplyRunning: false }, () => {
								ApplyButton(false);
								console.error("Error starting/stopping auto apply. Reverting UI to 'Start'. Error:", response?.message);
								if (response?.message === 'No active tab found.') {
									alert(noActiveTabsText);
								}
							});
						}
					});
				} else {
					console.error("Error: No active tab found.");
					alert(noActiveTabsText);
				}
			});
		});
	}
});

document.addEventListener('DOMContentLoaded', () => {
	chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
		changeAutoApplyButton(autoApplyRunning);
	});
});