export function testLog(){
	console.log('test log');
}




async function setStorageData(key, value) {
	return new Promise(resolve => {
		chrome.storage.local.set({ [key]: value }, () => {
			resolve();
		});
	});
}

async function updateStorageArray(key, updateFn) {
	const data = await getStorageData(key, []);
	const updatedData = updateFn(data);
	await setStorageData(key, updatedData);
}

function sendMessage(action, data = {}) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ action, data }, resolve);
	});
}