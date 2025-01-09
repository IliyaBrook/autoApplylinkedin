function showModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		console.log("Showing modal");
		modal.style.display = 'flex';
	}
}

function hideModal() {
	const modal = document.getElementById('overlay-modal-wrapper');
	if (modal) {
		console.log("Hiding modal");
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

//function bindModalEvents() {
// 	const goToJobSearchButton = document.getElementById('goToJobSearchButton');
// 	const closeModalButton = document.getElementById('closeModalButton');
//
// 	if (goToJobSearchButton) {
// 		goToJobSearchButton.addEventListener('click', () => {
// 			window.location.href = 'https://www.linkedin.com/jobs/search';
// 		});
// 	} else {
// 		console.error("'Go To Job Search' button not found in DOM");
// 	}
//
// 	if (closeModalButton) {
// 		closeModalButton.addEventListener('click', () => {
// 			hideModal();
// 		});
// 	}
// }
//
// document.addEventListener('DOMContentLoaded', () => {
// 	console.log("DOM fully loaded and parsed");
// 	bindModalEvents();
// });