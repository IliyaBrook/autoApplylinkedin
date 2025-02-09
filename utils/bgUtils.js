export function setStorageData(key, value, callback = null) {
	return chrome.storage.local.set({ [key]: value }, () => {
		if (callback) callback();
	});
}
export function getStorageData(key, defaultValue = null, callback = null) {
	if (Array.isArray(key)) {
		return chrome.storage.local.get(key, result => {
			if (callback) {
				callback(result ?? defaultValue)
			}else {
				return result ?? defaultValue;
			}
		});
	}else {
		return  chrome.storage.local.get(key, result => {
			if (callback) {
				callback(result[key] ?? defaultValue)
			}else {
				return result[key] ?? defaultValue
			}
		});
	}
}

