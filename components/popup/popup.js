function changeAutoApplyButton(isRunning, selector) {
	const startIcon = document.getElementById('start-icon')
	const runningIcon = document.getElementById('running-icon')
	
	if (isRunning) {
		selector.classList.add('running')
		selector.textContent = 'Stop Auto Apply'
		if (startIcon) startIcon.style.display = 'none'
		if (runningIcon) runningIcon.style.display = 'inline'
	} else {
		selector.classList.remove('running')
		selector.textContent = 'Start Auto Apply'
		if (startIcon) startIcon.style.display = 'inline'
		if (runningIcon) runningIcon.style.display = 'none'
	}
}

const getCurrentUrl = () => {
	return new Promise((resolve, reject) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs.length > 0) {
				chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentUrl' }, (response) => {
					const url = response?.url
					if (!url?.includes('linkedin.com/jobs')) {
						alert('Saved is only available on the LinkedIn jobs search page.')
						resolve(false)
						return
					}
					resolve(response.url)
				})
			} else {
				reject('Active tab not found')
			}
		})
	})
}

document.addEventListener('click', event => {
	if (event.target.tagName === 'BUTTON') {
		const buttonId = event.target.id
		const button = document.getElementById(buttonId)
		switch (buttonId) {
			case 'form-control-button':
				chrome.tabs.create({ url: '/components/formControl/formControl.html' })
				break
			case 'filter-settings-button':
				chrome.tabs.create({ url: '/components/filterSettings/filterSettings.html' })
				break
			case 'external-apply-button':
				chrome.tabs.create({ url: '/components/externalApply/externalApply.html' })
				break
			case 'export-button':
				chrome.storage.local.get(null, function(data) {
					const jsonData = JSON.stringify(data, null, 2)
					const blob = new Blob([jsonData], { type: 'application/json' })
					const url = URL.createObjectURL(blob)
					
					const link = document.createElement('a')
					link.href = url
					const { day, hour, minute, month } = getTime()
					link.download = `autoapply_settings_${day}_${month}_[${hour}_${minute}].json`
					link.click()
					
					URL.revokeObjectURL(url)
				})
				break
			case 'import-button':
				document.getElementById('import-file').click()
				break
			case 'save-link':
				chrome.storage.local.get('savedLinks', (result) => {
					const linkName = prompt('Enter link name')
					if (!linkName) {
						alert('Link name cannot be empty.')
						return
					}
					if (!('savedLinks' in result)) {
						getCurrentUrl().then(url => {
							chrome.storage.local.set({ savedLinks: { [linkName]: url } }, () => {
								alert('Link saved successfully!')
							})
						}).catch(err => {
							console.error('Error getting current url: ', err)
						})
					} else {
						getCurrentUrl().then(url => {
							const savedLinks = result.savedLinks
							const savedLinksSet = new Set(Object.values(savedLinks))
							if (linkName in savedLinks) {
								alert('Link name already exists.')
							} else if (savedLinksSet.has(url)) {
								alert('Link already exists.')
							} else {
								chrome.storage.local.set({
									savedLinks: {
										...savedLinks,
										[linkName]: url
									}
								}, () => {
									alert('Link saved successfully!')
								})
							}
						})
					}
				})
				break
			case 'show-links':
				try {
					let accordion = document.getElementById('linksAccordion');
					
					// Если аккордеон уже создан — переключаем его видимость
					if (accordion) {
						const content = accordion.querySelector('.accordion-content');
						content.style.display = content.style.display === 'none' ? 'block' : 'none';
					} else {
						// Создаем контейнер аккордеона
						accordion = document.createElement('div');
						accordion.id = 'linksAccordion';
						accordion.style.border = '1px solid #ccc';
						accordion.style.marginTop = '10px';
						accordion.style.padding = '10px';
						accordion.style.background = '#f9f9f9';
						
						// Заголовок аккордеона (можно нажать для сворачивания/разворачивания)
						const header = document.createElement('div');
						header.style.cursor = 'pointer';
						header.style.fontWeight = 'bold';
						header.style.marginBottom = '5px';
						header.textContent = 'Imported Links (нажмите для сворачивания/разворачивания)';
						header.addEventListener('click', () => {
							const content = accordion.querySelector('.accordion-content');
							content.style.display = content.style.display === 'none' ? 'block' : 'none';
						});
						accordion.appendChild(header);
						
						// Контейнер для содержимого аккордеона
						const content = document.createElement('div');
						content.className = 'accordion-content';
						content.style.display = 'block';
						accordion.appendChild(content);
						
						// Вставляем аккордеон под кнопкой "show-links"
						document.getElementById('show-links').parentElement.appendChild(accordion);
						
						// Загружаем сохранённые ссылки из chrome.storage.local
						chrome.storage.local.get('savedLinks', (result) => {
							const savedLinks = result.savedLinks || {};
							content.innerHTML = ""; // очищаем содержимое
							
							// Если ссылок нет — выводим сообщение
							if (Object.keys(savedLinks).length === 0) {
								const emptyMsg = document.createElement('div');
								emptyMsg.textContent = 'Сохранённых ссылок нет.';
								content.appendChild(emptyMsg);
								return;
							}
							
							// Для каждого элемента создаём строку списка
							Object.entries(savedLinks).forEach(([name, url]) => {
								const item = document.createElement('div');
								item.className = 'saved-link-item';
								item.style.display = 'flex';
								item.style.alignItems = 'center';
								item.style.justifyContent = 'space-between';
								item.style.marginBottom = '5px';
								item.style.padding = '5px';
								item.style.border = '1px solid #ddd';
								item.style.borderRadius = '4px';
								item.style.background = '#fff';
								
								// Название (ключ)
								const nameEl = document.createElement('span');
								nameEl.textContent = name;
								nameEl.style.flexGrow = '1';
								item.appendChild(nameEl);
								
								// Кнопка "Go"
								const goButton = document.createElement('button');
								goButton.className = 'modal-button primary go-button';
								goButton.textContent = 'Go';
								goButton.style.marginLeft = '5px';
								goButton.addEventListener('click', () => {
									// window.open(url, '_blank');
									chrome.runtime.sendMessage(
										{ action: 'openTabAndRunScript', url: url },
										(response) => {
											console.log('Результат открытия вкладки и выполнения скрипта:', response);
										}
									);
								});
								item.appendChild(goButton);
								
								// Кнопка "Delete"
								const deleteButton = document.createElement('button');
								deleteButton.className = 'modal-button danger delete-button';
								deleteButton.textContent = 'Delete';
								deleteButton.style.marginLeft = '5px';
								deleteButton.addEventListener('click', () => {
									chrome.storage.local.get('savedLinks', (res) => {
										const links = res.savedLinks || {};
										delete links[name];
										chrome.storage.local.set({ savedLinks: links }, () => {
											item.remove();
										});
									});
								});
								item.appendChild(deleteButton);
								
								content.appendChild(item);
							});
						});
					}
				}catch (error) {
					console.log("show-links popup.js error:", error)
				}
				break
			case 'start-auto-apply-button':
				// save udemy links with filters query
				if (typeof chrome !== 'undefined' && chrome?.storage && chrome?.storage.local) {
					chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
						const newState = !autoApplyRunning
						changeAutoApplyButton(newState, button)
						chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
							const noActiveTabsText = 'No active tabs found try to go to a LinkedIn job search page or refresh the page.'
							if (tabs && tabs.length > 0) {
								const currentTabId = tabs?.id
								chrome.runtime.sendMessage({
									action: newState ? 'startAutoApply' : 'stopAutoApply',
									tabId: currentTabId
								}, response => {
									if (response?.success) {
										chrome.storage.local.set({ autoApplyRunning: newState }, () => {
											console.log('Auto apply state updated in storage and UI (success response). New state:', newState)
										})
									} else {
										chrome.storage.local.set({ autoApplyRunning: false }, () => {
											changeAutoApplyButton(false, button)
											if (response?.message === 'No active tab found.') {
												alert(noActiveTabsText)
											}
										})
									}
								})
							} else {
								console.error('Error: No active tab found.')
								alert(noActiveTabsText)
							}
						})
					})
				}
				break
		}
	}
})

// import file button logic
document.getElementById('import-file').addEventListener('change', function(event) {
	const file = event.target.files[0]
	if (!file) return
	
	const reader = new FileReader()
	reader.onload = function(e) {
		try {
			const importedData = JSON.parse(e.target.result)
			chrome.storage.local.set(importedData, function() {
				alert('Settings imported successfully!')
			})
		} catch (err) {
			alert('Parsing error JSON. ' + err)
		}
	}
	reader.readAsText(file)
})

document.addEventListener('DOMContentLoaded', () => {
	const autoApplyButton = document.getElementById('start-auto-apply-button')
	chrome.storage.local.get('autoApplyRunning', ({ autoApplyRunning }) => {
		changeAutoApplyButton(autoApplyRunning, autoApplyButton)
	})
})