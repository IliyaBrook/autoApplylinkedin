chrome.runtime.sendMessage({ action: 'stopAutoApply' })
	.then(() => {
		chrome.storage.local.set({ autoApplyRunning: false })
			.then(() => {
				console.log("Easy apply stopped!")
			})
	})
