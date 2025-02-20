chrome.runtime.sendMessage({ action: 'stopAutoApply' })
	.then(() => {
		chrome.storage.local.set({ autoApplyRunning: false })
			.then(() => {
				console.log("Easy apply stopped!")
			})
	})

// document.addEventListener('DOMContentLoaded', () => { // Ждем загрузки DOM
// 	const stopButton = document.getElementById('stopScriptButton');
// 	console.log("stopButton:", stopButton)
//
// 	if (stopButton) {
// 		stopButton.addEventListener('click', () => {
// 			chrome.runtime.sendMessage({ action: 'stopAutoApply' }, (response) => {
// 				if (response && response.success) {
// 					console.log('Script stopped by user.');
// 				} else {
// 					console.error('Failed to stop script:', response);
// 				}
// 			});
// 		});
// 	}
// });