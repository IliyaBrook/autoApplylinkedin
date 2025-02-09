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

// function ApplyButton(isRunning) {
// 	chrome.storage.local.get(['currentUrl', 'autoApplyRunning', 'defaultFields'], (res) => {
// 		const currentUrl = res?.currentUrl || '';
// 		const autoApplyRunning = res?.autoApplyRunning || false;
// 		if (currentUrl && !currentUrl.includes('linkedin.com/jobs/search')) {
// 			console.log("is notOnJobSearchModalShow:", notOnJobSearchModalShow)
//
// 			if (typeof notOnJobSearchModalShow === 'function') {
// 				notOnJobSearchModalShow();
// 			}
// 			chrome.storage.local.set({ autoApplyRunning: false });
// 		} else {
// 			changeAutoApplyButton(isRunning)
// 		}
// 	});
// }

autoApplyButton.addEventListener('click', () => {
	if (typeof chrome !== 'undefined' && chrome?.storage && chrome?.storage.local) {
		chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
			const newState = !autoApplyRunning;
			
			ApplyButton(newState);
			
			chrome.runtime.sendMessage({
				action: newState ? 'startAutoApply' : 'stopAutoApply'
			}, response => {
				if (response?.success) {
					chrome.storage.local.set({ autoApplyRunning: newState }, () => {
						// No need to call ApplyButton again here - UI is already updated before sendMessage
						console.log("Auto apply state updated in storage and UI (success response). New state:", newState); // Optional log
					});
				} else {
					chrome.storage.local.set({ autoApplyRunning: false }, () => {
						ApplyButton(false); // Revert UI to "Start" state in case of error
						console.error("Error starting/stopping auto apply. Reverting UI to 'Start'. Error:", response?.message); // Optional error log
					});
				}
			});
		});
	}
});


document.addEventListener('DOMContentLoaded', () => {
	chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
		changeAutoApplyButton(autoApplyRunning); // Initial button state on popup load
	});
});