export function setStorageData(key, value) {
	return new Promise(resolve => {
		chrome.storage.local.set({ [key]: value }, () => {
			resolve();
		});
	});
}

export async function getStorageData(key, defaultValue = null) {
	return await new Promise(resolve => {
		if (Array.isArray(key)) {
			chrome.storage.local.get(key, (result) => {
				resolve(result ?? defaultValue);
			});
		}else {
			chrome.storage.local.get(key, (result) => {
				resolve(result[key] ?? defaultValue)
			});
		}
	});
}