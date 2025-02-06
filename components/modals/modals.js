// Not on job search modal hide
function notOnJobSearchModalShow() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'flex';
	}
}

function notOnJobSearchModalHide() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'none';
	}
}

const goToJobSearchButton = document.getElementById('goToJobSearchButton');
const closeModalButton = document.getElementById('closeModalButton');
if (goToJobSearchButton) {
	goToJobSearchButton.addEventListener('click', () => {
		notOnJobSearchModalHide()
		window.location.href = 'https://www.linkedin.com/jobs/search';
	});
}

if (closeModalButton) {
	closeModalButton.addEventListener('click', notOnJobSearchModalHide);
}

// Form control modal
function showFormControlModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'flex';
	}
}

function hideFormControlModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'none';
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const goToFormControlButton = document.getElementById('goToFormControlButton');
	const closeModalButton = document.getElementById('closeModalButton');
	
	if (goToFormControlButton) {
		goToFormControlButton.addEventListener('click', () => {
			hideFormControlModal();
			chrome.tabs.create({ url: chrome.runtime.getURL('/components/formControl/formControl.html') });
		});
	}
	
	if (closeModalButton) {
		closeModalButton.addEventListener('click', hideFormControlModal);
	}
});