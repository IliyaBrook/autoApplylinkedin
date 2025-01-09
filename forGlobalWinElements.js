if (window.location.hostname === "www.linkedin.com" || window.location.hostname === "linkedin.com") {
	void initElements()
	initStorage()
}

function initStorage() {
	chrome.runtime.sendMessage({ action: 'initStorage' })
}

async function createCustomElement({
	                                   htmlPath,
	                                   cssPath,
	                                   jsPath,
	                                   elementId,
	                                   additionalStyles = '',
	                                   additionalScripts = []
                                   } = {}) {
	try {
		const htmlResponse = await fetch(chrome.runtime.getURL(htmlPath));
		const html = await htmlResponse.text();
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html.trim();
		const customElement = tempDiv.querySelector(`#${elementId}`);
		if (customElement) {
			if (cssPath) {
				const elementStyles = document.createElement('link');
				elementStyles.rel = 'stylesheet';
				elementStyles.href = chrome.runtime.getURL(cssPath);
				document.head.appendChild(elementStyles);
			}
			
			if (additionalStyles) {
				customElement.style.cssText += additionalStyles;
			}
			
			if (jsPath) {
				const elementScript = document.createElement('script');
				elementScript.src = chrome.runtime.getURL(jsPath);
				elementScript.type = 'module';
				document.body.appendChild(elementScript);
			}
			
			additionalScripts.forEach(scriptPath => {
				const script = document.createElement('script');
				script.src = chrome.runtime.getURL(scriptPath);
				script.type = 'module';
				document.body.appendChild(script);
			});
			
			return customElement;
		}
	} catch (err) {
		throw new Error(`Failed to create custom element: ${err.message}`);
	}
}

async function initElements() {
	try {
		const overlayWrapper = await createCustomElement({
			htmlPath: 'components/overlayModalWrapper/overlayModalWrapper.html',
			cssPath: 'components/overlayModalWrapper/overlayModalWrapper.css',
			elementId: 'overlay-modal-wrapper',
		})
		document.body.appendChild(overlayWrapper);
		const notOnJobSearchAlert = await createCustomElement({
			htmlPath: 'components/notOnJobSearchModal/notOnJobSearchModal.html',
			cssPath: 'components/notOnJobSearchModal/notOnJobSearchModal.css',
			additionalScripts: [
				'components/notOnJobSearchModal/notOnJobSearchModal.js'
			],
			elementId: 'customAlertOverlay',
		});
		if (notOnJobSearchAlert) {
			overlayWrapper.appendChild(notOnJobSearchAlert)
		}

		
	} catch (err) {
		console.error('Error creating elements:', err);
	}
}