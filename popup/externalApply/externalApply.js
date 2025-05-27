document.addEventListener('DOMContentLoaded', () => {
	const linksDiv = document.getElementById('links');
	const removeAllBtn = document.getElementById('remove-all');
	const openAllLinksBtn = document.getElementById('open-all-links');
	const removeDuplicatesBtn = document.getElementById('remove-duplicates');
	const linksCountElement = document.getElementById('links-count');
	
	// Function to update the links counter
	function updateLinksCounter(count) {
		linksCountElement.textContent = count;
	}
	
	chrome.storage.local.get('' +
		'externalApplyData', result => {
		const arr = result.externalApplyData || [];
		arr.forEach((job) => {
			addLinkRow(job);
		});
		updateLinksCounter(arr.length);
	});
	
	removeAllBtn.addEventListener('click', () => {
		chrome.storage.local.set({ externalApplyData: [] }, () => {
			linksDiv.innerHTML = '';
			updateLinksCounter(0);
		});
	});
	
	openAllLinksBtn.addEventListener('click', () => {
		chrome.storage.local.get('externalApplyData', result => {
			const arr = result.externalApplyData || [];
			arr.forEach(job => {
				window.open(job.link, '_blank');
			});
		})
	});
	
	removeDuplicatesBtn.addEventListener('click', () => {
		removeDuplicateLinks();
	});
	
	function removeDuplicateLinks() {
		chrome.storage.local.get('externalApplyData', result => {
			const arr = result.externalApplyData || [];
			const uniqueLinks = new Map();
			
			// Keep only the first occurrence of each link
			const uniqueArr = arr.filter(job => {
				if (!uniqueLinks.has(job.link)) {
					uniqueLinks.set(job.link, true);
					return true;
				}
				return false;
			});
			
			// Update storage with unique links
			chrome.storage.local.set({ externalApplyData: uniqueArr }, () => {
				// Refresh UI
				linksDiv.innerHTML = '';
				uniqueArr.forEach(job => {
					addLinkRow(job);
				});
				updateLinksCounter(uniqueArr.length);
			});
		});
	}
	
	function addLinkRow(job) {
		const container = document.createElement('div');
		container.className = 'link-container';
		
		const title = document.createElement('div');
		title.className = 'job-title';
		title.textContent = (job?.title ?? '').trim();
		
		
		const companyWrapper = document.createElement('div');
		companyWrapper.style.display = 'flex';
		companyWrapper.style.justifyContent = 'space-between';
		companyWrapper.style.alignItems = 'center';
		
		let timeString = ''
		if (job?.time) {
			const date = new Date(job.time);
			const day = String(date.getDate()).padStart(2, '0');
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const year = String(date.getFullYear()).slice(-2);
			const hour = String(date.getHours()).padStart(2, '0');
			const minute = String(date.getMinutes()).padStart(2, '0');
			timeString = `${day}/${month}/${year}, ${hour}:${minute}`;
		}
		
		
		const time = document.createElement('div');
		time.className = 'job-time';
		time.textContent = timeString;
		time.style.fontSize = '12px';
		time.style.color = '#777';
		
		
		const company = document.createElement('div');
		company.className = 'company-name';
		company.textContent = `Company: ${(job?.companyName ?? '').trim()}`;
		
		
		companyWrapper.appendChild(company);
		companyWrapper.appendChild(time);
		
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
		
		container.appendChild(companyWrapper);
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
			updateLinksCounter(arr.length);
		});
	}
});
