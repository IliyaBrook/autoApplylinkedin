if (window.location.hostname === 'www.linkedin.com' || window.location.hostname === 'linkedin.com') {
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
			console.trace('Invalid parameters: htmlPath or elementId is missing.')
		} else {
			const htmlResponse = await fetch(chrome.runtime.getURL(htmlPath))
			const html = await htmlResponse.text()
			if (!htmlResponse.ok) {
				console.trace(`Failed to load ${htmlPath}, status: ${htmlResponse.status}`)
			} else {
				const tempDiv = document.createElement('div')
				tempDiv.innerHTML = html.trim()
				const customElement = tempDiv.querySelector(`#${elementId}`)
				if (customElement) {
					if (cssPath) {
						const elementStyles = document.createElement('link')
						elementStyles.rel = 'stylesheet'
						elementStyles.href = chrome.runtime.getURL(cssPath)
						document.head.appendChild(elementStyles)
					}
					
					if (additionalStyles) {
						customElement.style.cssText += additionalStyles
					}
					
					if (jsPath) {
						const elementScript = document.createElement('script')
						elementScript.src = chrome.runtime.getURL(jsPath)
						elementScript.type = 'module'
						document.body.appendChild(elementScript)
					}
					if (additionalScripts.length > 0) {
						additionalScripts.forEach(scriptPath => {
							const script = document.createElement('script')
							script.src = chrome.runtime.getURL(scriptPath)
							script.type = 'module'
							document.body.appendChild(script)
						})
					}
					return customElement
				}
			}
		}
	} catch (err) {
		console.trace('❌ Error in createCustomElement: ' + err?.message)
		return null
	}
}

async function initElements() {
	try {
		if (!document.body) {
			setTimeout(initElements, 100)
			return
		}
		const notOnJobSearchAlert = await createCustomElement({
			htmlPath: 'modals/notOnJobSearchModal.html',
			cssPath: 'modals/modals.css',
			additionalScripts: [
				'modals/modals.js'
			],
			elementId: 'notOnJobSearchOverlay'
		})
		if (notOnJobSearchAlert) {
			document.body.appendChild(notOnJobSearchAlert)
		}
		const formControlAlert = await createCustomElement({
			htmlPath: '/modals/formControlModal.html',
			cssPath: '/modals/modals.css',
			additionalScripts: [
				'/modals/modals.js'
			],
			elementId: 'formControlOverlay'
		})
		if (formControlAlert) {
			document.body.appendChild(formControlAlert)
		}
		const scriptRunningModal = await createCustomElement({
			htmlPath: 'modals/runningModal.html',
			cssPath: 'modals/modals.css',
			elementId: 'scriptRunningOverlay'
		})
		if (scriptRunningModal) {
			document.body.appendChild(scriptRunningModal)
		}
	} catch (err) {
		console.error('❌ Error creating elements:', err?.message)
	}
}