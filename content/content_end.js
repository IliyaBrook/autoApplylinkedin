chrome.runtime.sendMessage({ action: 'stopAutoApply' })
	.then(() => {
		chrome.storage.local.set({ autoApplyRunning: false })
		console.log("Easy apply stopped!")
	})
