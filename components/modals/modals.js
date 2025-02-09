// selectors
const goToJobSearchButton = document.getElementById('goToJobSearchButton')
const closeModalButton = document.getElementById('closeModalButton')
const notOnJobSearchOverlay = document.getElementById('notOnJobSearchOverlay')

const closeModalBtnFormControl = document.getElementById('closeModalFormControl')
const formControlOverlay = document.getElementById('formControlOverlay')

// Not on job search modal
function notOnJobSearchModalShow() {
	if (notOnJobSearchOverlay) {
		hideAllModals()
		notOnJobSearchOverlay.style.display = 'flex'
	}
}

function hideAllModals() {
	if (notOnJobSearchOverlay) {
		// notOnJobSearchOverlay.style.display = 'none'
	}
	if (formControlOverlay) {
		// formControlOverlay.style.display = 'none'
	}
}

if (goToJobSearchButton) {
	goToJobSearchButton.addEventListener('click', () => {
		hideAllModals()
		window.location.href = 'https://www.linkedin.com/jobs/search'
	})
}

if (closeModalButton) {
	closeModalButton.addEventListener('click', hideAllModals)
}

if (closeModalBtnFormControl) {
	closeModalBtnFormControl.addEventListener('click', hideAllModals)
}

function showFormControlModal() {
	hideAllModals()
	if (formControlOverlay) {
		formControlOverlay.style.display = 'flex'
	}
}
