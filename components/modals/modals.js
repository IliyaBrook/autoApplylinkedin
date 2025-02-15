document.addEventListener('click', event => {
	const notOnJobSearchOverlay = document.getElementById('notOnJobSearchOverlay')
	const savedLinksOverlay = document.getElementById('savedLinksOverlay')
	const formControlOverlay = document.getElementById('formControlOverlay')
	
	const allOverlays = [
		notOnJobSearchOverlay,
		savedLinksOverlay,
		formControlOverlay
	]
	const tagName = event.target.tagName
	if (tagName=== 'BUTTON') {
		const buttonId = event.target.id
		if (buttonId.includes('close')) {
			allOverlays.forEach(overlay => {
				overlay.style.display = 'none'
			})
		}
	}
})