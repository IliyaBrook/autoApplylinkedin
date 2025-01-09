document.addEventListener('DOMContentLoaded', () => {
	const linksDiv = document.getElementById('links');
	const removeAllBtn = document.getElementById('remove-all');
	
	chrome.storage.local.get('externalApplyData', result => {
		const arr = result.externalApplyData || [];
		arr.forEach((job, index) => {
			addLinkRow(job, index);
		});
	});
	
	removeAllBtn.addEventListener('click', () => {
		chrome.storage.local.set({ externalApplyData: [] }, () => {
			linksDiv.innerHTML = '';
		});
	});
	
	function addLinkRow(job) {
		const container = document.createElement('div');
		container.className = 'link-container';
		
		const title = document.createElement('div');
		title.className = 'job-title';
		title.textContent = job.title.trim();
		
		const link = document.createElement('a');
		link.href = job.link;
		link.textContent = job.link;
		link.target = '_blank';
		
		const deleteBtn = document.createElement('button');
		deleteBtn.textContent = 'Delete';
		deleteBtn.addEventListener('click', () => {
			removeUrl(job.link);
			container.remove();
		});
		
		container.appendChild(title);
		container.appendChild(link);
		container.appendChild(deleteBtn);
		linksDiv.appendChild(container);
	}
	
	function removeUrl(urlToDelete) {
		chrome.storage.local.get('externalApplyData', result => {
			let arr = result.externalApplyData || [];
			arr = arr.filter(job => job.link !== urlToDelete);
			chrome.storage.local.set({ externalApplyData: arr });
		});
	}
});
