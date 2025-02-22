(async () => {
	try {
		const { autoApplyRunning } = await chrome.storage.local.get('autoApplyRunning');
		if (autoApplyRunning) {
			await chrome.storage.local.set({ autoApplyRunning: false });
		}
	} catch (error) {
		logTrace(error);
	}
})();

