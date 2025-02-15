if (window.location.hostname === "www.linkedin.com" || window.location.hostname === "linkedin.com") {
	void initElements()
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
		if (!htmlPath || !elementId) {
			console.error("Invalid parameters: htmlPath or elementId is missing.");
		}else {
			const htmlResponse = await fetch(chrome.runtime.getURL(htmlPath));
			const html = await htmlResponse.text();
			if (!htmlResponse.ok) {
				console.error(`Failed to load ${htmlPath}, status: ${htmlResponse.status}`);
			}else {
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
			}
		}
	} catch (err) {
		console.error(`❌ Error in createCustomElement: ${err.message}`);
		return null;
	}
}

async function initElements() {
	try {
		if (!document.body) {
			setTimeout(initElements, 100);
			return;
		}
		const notOnJobSearchAlert = await createCustomElement({
			htmlPath: 'components/modals/notOnJobSearchModal.html',
			cssPath: 'components/modals/modals.css',
			additionalScripts: [
				'components/modals/modals.js'
			],
			elementId: 'notOnJobSearchOverlay',
		});
		if (notOnJobSearchAlert) {
			document.body.appendChild(notOnJobSearchAlert)
		}
		const formControlAlert = await createCustomElement({
			htmlPath: 'components/modals/formControlModal.html',
			cssPath: 'components/modals/modals.css',
			additionalScripts: [
				'components/modals/modals.js'
			],
			elementId: 'formControlOverlay',
		});
		if (formControlAlert) {
			document.body.appendChild(formControlAlert)
		}
	} catch (err) {
		console.error('❌ Error creating elements:', err);
	}
}