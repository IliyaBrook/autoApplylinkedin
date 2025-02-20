document.addEventListener('click', event => {
	const notOnJobSearchOverlay = document.getElementById('notOnJobSearchOverlay')
	const formControlOverlay = document.getElementById('formControlOverlay')
	const allOverlays = [
		notOnJobSearchOverlay,
		formControlOverlay
	]
	const tagName = event.target.tagName
	if (tagName=== 'BUTTON') {
		const buttonId = event.target.id
		if (buttonId.includes('close')) {
			allOverlays.forEach(overlay => {
				overlay.style.display = 'none'
			})
		}else if (buttonId.includes('goToJobSearchButton')) {
			window.location.href = 'https://www.linkedin.com/jobs/search'
		}
	}
})