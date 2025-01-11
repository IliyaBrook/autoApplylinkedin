function showModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'flex';
	}
}

function hideModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		modal.style.display = 'none';
	}
}

const goToJobSearchButton = document.getElementById('goToJobSearchButton');
const closeModalButton = document.getElementById('closeModalButton');
if (goToJobSearchButton) {
	goToJobSearchButton.addEventListener('click', () => {
		hideModal()
		window.location.href = 'https://www.linkedin.com/jobs/search';
	});
}

if (closeModalButton) {
	closeModalButton.addEventListener('click', hideModal);
}