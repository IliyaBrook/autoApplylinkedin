// noinspection JSCheckFunctionSignatures
let defaultFields = {
	YearsOfExperience: '',
	City: '',
	FirstName: '',
	LastName: '',
	Email: '',
	PhoneNumber: ''
}

async function stopScript() {
	await chrome.runtime.sendMessage({ action: 'stopAutoApply' })
	await chrome.storage.local.set({ autoApplyRunning: false })
	console.log("Easy apply stopped!")
}

async function checkAndPrepareRunState() {
	return new Promise((resolve) => {
		chrome.storage.local.get('autoApplyRunning', (result) => {
			if (result.autoApplyRunning) {
				resolve(true)
			} else {
				stopScript()
					.then(() => {
						resolve(false)
					})
			}
		})
	})
}

async function performInputFieldCityCheck() {
	const cityInput = document.querySelector('.search-vertical-typeahead input')
	
	if (cityInput) {
		
		cityInput.click()
		
		cityInput.value = defaultFields.City
		
		const inputEvent = new Event('input', { bubbles: true })
		
		cityInput.dispatchEvent(inputEvent)
		
		await new Promise(resolve => setTimeout(resolve, 500))
		
		const firstOption = document.querySelector('.basic-typeahead__selectable')
		if (firstOption) {
			firstOption.click()
		}
	}
}

function getJobTitle(jobNameLink) {
	if (!jobNameLink) return ''
	let jobTitle = ''
	
	const visibleSpan = jobNameLink.querySelector('span[aria-hidden="true"]')
	if (visibleSpan && visibleSpan.textContent.trim().length > 0) {
		jobTitle = visibleSpan.textContent.trim()
	} else {
		jobTitle = jobNameLink.getAttribute('aria-label') || ''
		if (!jobTitle) {
			console.warn('Job title not found using both selectors')
		}
	}
	return jobTitle.toLowerCase()
}

async function clickDoneIfExist() {
	try {
		const modal = document.querySelector('.artdeco-modal');
		if (modal) {
			const xpathResult = getElementsByXPath({
				context: modal,
				xpath: '//button[.//*[contains(text(), "Done")] or contains(normalize-space(.), "Done")]'
			});
			if (xpathResult && xpathResult.length > 0) {
				const doneButton = xpathResult[0];
				await clickElement({elementOrSelector: doneButton})
				await addDelay();
			}
		}
	} catch (error) {
		console.error('clickDoneIfExist error:', error);
	}
}

async function clickJob(listItem, companyName, jobTitle, badWordsEnabled, jobNameLink) {
	const apply = async () => {
		await runFindEasyApply(jobTitle, companyName);
		await clickDoneIfExist();
		await addDelay(1000);
	};
	await clickElement({ elementOrSelector: jobNameLink })
	// await addDelay()
	if (badWordsEnabled) {
		const jobDetailsElement = document.querySelector('[class*="jobs-box__html-content"]');
		if (jobDetailsElement) {
			const jobContentText = jobDetailsElement.textContent.toLowerCase().trim();
			const response = await chrome.storage.local.get(['badWords']);
			const badWords = response?.badWords;
			if (badWords?.length > 0) {
				let matchedBadWord = null;
				for (const badWord of badWords) {
					const regex = new RegExp('\\b' + badWord.trim().replace(/\+/g, '\\+') + '\\b', 'i');
					if (regex.test(jobContentText)) {
						matchedBadWord = badWord;
						break;
					}
				}
				if (matchedBadWord) {
					console.log('Bad word found: ' + matchedBadWord);
					return;
				}
			}
			await apply();
			return;
		}
	}
	await apply();
}

async function performInputFieldChecks() {
	const result = await chrome.runtime.sendMessage({ action: 'getInputFieldConfig' })
	
	const questionContainers = document.querySelectorAll('.fb-dash-form-element')
	
	for (const container of questionContainers) {
		
		const label = container.querySelector('.artdeco-text-input--label')
		
		const inputField = container.querySelector('.artdeco-text-input--input')
		
		let labelText
		
		if (label) {
			
			labelText = label.textContent.trim()
			
			const foundConfig = result.find(config => config.placeholderIncludes === labelText)
			
			if (foundConfig) {
				
				inputField.value = foundConfig.defaultValue;
				
				['keydown', 'keypress', 'input', 'keyup'].forEach(eventType => {
					inputField.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }))
				})
				
				inputField.dispatchEvent(new Event('change', { bubbles: true }))
			} else {
				inputField.value = defaultFields.YearsOfExperience;
				['keydown', 'keypress', 'input', 'keyup'].forEach(eventType => {
					inputField.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }))
				})
				inputField.dispatchEvent(new Event('change', { bubbles: true }))
			}
			
			void chrome.runtime.sendMessage({ action: 'updateInputFieldConfigsInStorage', data: labelText })
		}
	}
}

async function performRadioButtonChecks() {
	const storedRadioButtons = await new Promise((resolve) => {
		chrome.storage.local.get('radioButtons', (result) => {
			resolve(result.radioButtons || [])
		})
	})
	
	const radioFieldsets = document.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component="true"]')
	
	for (const fieldset of radioFieldsets) {
		const legendElement = fieldset.querySelector('legend')
		const questionTextElement = legendElement.querySelector('span[aria-hidden="true"]')
		const placeholderText = questionTextElement?.textContent.trim() || legendElement.textContent.trim()
		
		const storedRadioButtonInfo = storedRadioButtons.find(info => info.placeholderIncludes === placeholderText)
		
		if (storedRadioButtonInfo) {
			const radioButtonWithValue = fieldset.querySelector(`input[type="radio"][value="${storedRadioButtonInfo.defaultValue}"]`)
			
			if (radioButtonWithValue) {
				radioButtonWithValue.checked = true
				radioButtonWithValue.dispatchEvent(new Event('change', { bubbles: true }))
			}
			
			storedRadioButtonInfo.count++
		} else {
			const firstRadioButton = fieldset.querySelector('input[type="radio"]')
			if (firstRadioButton) {
				firstRadioButton.checked = true
				firstRadioButton.dispatchEvent(new Event('change', { bubbles: true }))
				
				const options = Array.from(fieldset.querySelectorAll('input[type="radio"]')).map(radioButton => {
					const labelElement = fieldset.querySelector(`label[for="${radioButton.id}"]`)
					return {
						value: radioButton.value,
						text: labelElement?.textContent.trim() || radioButton.value,
						selected: radioButton.checked
					}
				})
				
				const newRadioButtonInfo = {
					placeholderIncludes: placeholderText,
					defaultValue: firstRadioButton.value,
					count: 1,
					options: options
				}
				
				storedRadioButtons.push(newRadioButtonInfo)
				
				await chrome.storage.local.set({ 'radioButtons': storedRadioButtons })
			}
		}
	}
	
	await chrome.storage.local.set({ 'radioButtons': storedRadioButtons })
}

async function performDropdownChecks() {
	const dropdowns = document.querySelectorAll('.fb-dash-form-element select')
	
	dropdowns.forEach(dropdown => {
		const parentElement = dropdown.closest('.fb-dash-form-element')
		if (parentElement) {
			const secondOption = dropdown.options[1]
			if (secondOption) {
				secondOption.selected = true
				dropdown.dispatchEvent(new Event('change', { bubbles: true }))
			}
		}
	})
}

async function performCheckBoxFieldCityCheck() {
	const checkboxFieldsets = document.querySelectorAll('fieldset[data-test-checkbox-form-component="true"]')
	checkboxFieldsets.forEach(fieldset => {
		
		const firstCheckbox = fieldset.querySelector('input[type="checkbox"]')
		if (firstCheckbox) {
			
			firstCheckbox.checked = true
			
			firstCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
		}
	})
}

async function performSafetyReminderCheck() {
	
	const modal = document.querySelector('.artdeco-modal')
	
	if (modal) {
		
		const modalHeader = modal.querySelector('.artdeco-modal__header')
		
		if (modalHeader && modalHeader.textContent.includes('Job search safety reminder')) {
			
			const dismissButton = modal.querySelector('.artdeco-modal__dismiss')
			
			if (dismissButton) {
				
				dismissButton.click()
			}
		}
	}
}

async function validateAndCloseConfirmationModal() {
	
	const modal = document.querySelector('.artdeco-modal')
	
	if (modal) {
		
		const modalHeader = modal.querySelector('.artdeco-modal__header')
		
		if (modalHeader && modalHeader.textContent.includes('Save this application?')) {
			
			const dismissButton = modal.querySelector('.artdeco-modal__dismiss')
			
			if (dismissButton) {
				
				dismissButton.click()
			}
		}
	}
}


async function checkForError() {
	
	const feedbackMessageElement = document.querySelector('.artdeco-inline-feedback__message')
	
	return feedbackMessageElement !== null
	
}

async function terminateJobModel() {
	
	const dismissButton = document.querySelector('button[aria-label="Dismiss"]')
	
	if (dismissButton) {
		
		dismissButton.click()
		
		dismissButton.dispatchEvent(new Event('change', { bubbles: true }))
		
		const discardButton = Array.from(document.querySelectorAll('button[data-test-dialog-secondary-btn]'))
			
			.find(button => button.textContent.trim() === 'Discard')
		
		if (discardButton) {
			discardButton.click()
			discardButton.dispatchEvent(new Event('change', { bubbles: true }))
		}
	}
}

async function runValidations() {
	await validateAndCloseConfirmationModal()
	await performInputFieldChecks()
	await performRadioButtonChecks()
	await performDropdownChecks()
	await performInputFieldCityCheck()
	await performCheckBoxFieldCityCheck()
}

async function uncheckFollowCompany() {
	const followCheckbox = document.querySelector < HTMLInputElement > ('#follow-company-checkbox')
	if (followCheckbox?.checked) {
		followCheckbox.checked = false
		const changeEvent = new Event('change', { bubbles: true, cancelable: true })
		followCheckbox.dispatchEvent(changeEvent)
	}
}

async function runApplyModel() {
  await addDelay(2000);
  await performSafetyReminderCheck();

  const continueApplyingButton = document.querySelector('button[aria-label="Continue applying"]');
  if (continueApplyingButton) {
    continueApplyingButton.click();
    await runApplyModel();
    return;
  }

  const nextButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Next'));
  const reviewButton = document.querySelector('button[aria-label="Review your application"]');
  const submitButton = document.querySelector('button[aria-label="Submit application"]');

  if (submitButton) {
    await addDelay(600);
    await uncheckFollowCompany();
    await addDelay(600);
    submitButton.click();

    await addDelay();

    const modalCloseButton = document.querySelector('.artdeco-modal__dismiss');
    if (modalCloseButton) {
      modalCloseButton.click();
      return;
    }
  }

  if (nextButton || reviewButton) {
    const buttonToClick = reviewButton || nextButton;
		
    await runValidations();
    const isError = await checkForError();

    if (isError) {
      await terminateJobModel();
    } else {
      await clickElement({
	      elementOrSelector: buttonToClick
      })
      await runApplyModel();
    }
  }
}

async function runFindEasyApply(jobTitle, companyName) {
	await addDelay(1000);
	const currentPageLink = window.location.href;
	const externalApplyElements = getElementsByXPath({ xpath: not_easy_apply_button });
	if (externalApplyElements.length > 0) {
		await chrome.runtime.sendMessage({
			action: 'externalApplyAction',
			data: { jobTitle, currentPageLink, companyName }
		});
	}
	const easyApplyElements = getElementsByXPath({ xpath: easy_apply_button });
	if (easyApplyElements.length > 0) {
		await Promise.race(
			Array.from(easyApplyElements).map(async (button) => {
				button.click();
				return await runApplyModel();
			})
		);
	}
}

// if (buttons.length === 0) {
// 	buttons = getElementsByXPath({xpath: '//*[text()="Show all"]'})
// }
// async function goToNextPage() {
// 	const buttons = getElementsByXPath({ xpath: '//button[.//text()[contains(., \'Next\')]]' })
//
// 	const nextButton = buttons?.[0]
// 	return await clickElement({
// 		elementOrSelector: nextButton,
// 		timeout: 5000,
// 		action: () => {
// 			scrollLittle()
// 		}
// 	})
// }

async function goToNextPage() {
	let buttons = getElementsByXPath({ xpath: '//button[.//text()[contains(., \'Next\')]]' })
	// if (buttons.length === 0) {
	// 	buttons = getElementsByXPath({xpath: '//*[text()="Show all"]'})
	// }
	const nextButton = buttons?.[0]
	return new Promise((resolve, reject) => {
		if (!nextButton) {
			reject(new Error('No next and show all button found'))
		}
		if (nextButton) {
			setTimeout(() => {
				nextButton.click()
				resolve()
			}, 2000)
		}
	}).then(runScript)
		.catch(err => {
			console.error('goToNextPage error:', err)
		})
}



function toggleBlinkingBorder(element) {
	let count = 0
	const intervalId = setInterval(() => {
		element.style.border = count % 2 === 0 ? '2px solid red' : 'none'
		count++
		if (count === 10) {
			clearInterval(intervalId)
			element.style.border = 'none'
		}
	}, 500)
}

async function checkLimitReached() {
	return new Promise((resolve) => {
		const feedbackMessageElement = document.querySelector('.artdeco-inline-feedback__message')
		
		if (feedbackMessageElement) {
			const textContent = feedbackMessageElement.textContent
			
			const searchString = 'You’ve exceeded the daily application limit'
			
			resolve(textContent.includes(searchString))
		} else {
			resolve(false)
		}
	})
}

function isChromeStorageAvailable() {
	return (
		typeof chrome !== 'undefined' &&
		chrome.storage &&
		chrome.storage.local
	)
}

async function checkAndPromptFields() {
	try {
		if (!isChromeStorageAvailable()) {
			return false
		}
		const response = await chrome.storage.local.get('defaultFields')
		return response?.defaultFields
	} catch (e) {
		console.error('Error in checkAndPromptFields:', e)
		return false
	}
}

async function closeApplicationSentModal() {
	const modal = document.querySelector('.artdeco-modal')
	
	if (modal?.textContent.includes('Application sent') && modal.textContent.includes('Your application was sent to')) {
		modal.querySelector('.artdeco-modal__dismiss')?.click()
	}
}
let firstRun = true
async function runScript() {
	console.log('Easy apply started!')

	if (firstRun) {
		console.log('is first time!', firstRun)
		await addDelay(4000)
	}else {
		await addDelay(2000)
	}
	firstRun = false
	
	try {
		await chrome.storage.local.set({ autoApplyRunning: true })
		const fieldsComplete = await checkAndPromptFields()
		if (!fieldsComplete) {
			await chrome.runtime.sendMessage({ action: 'openDefaultInputPage' })
			return
		}
		const limitReached = await checkLimitReached()
		
		if (limitReached) {
			const feedbackMessageElement = document.querySelector('.artdeco-inline-feedback__message')
			toggleBlinkingBorder(feedbackMessageElement)
			return
		}
		
		const {
			titleSkipEnabled,
			titleFilterEnabled,
			badWordsEnabled,
			titleFilterWords,
			titleSkipWords
		} = await chrome.storage.local.get([
			'titleSkipEnabled',
			'titleFilterEnabled',
			'badWordsEnabled',
			'titleFilterWords',
			'titleSkipWords'
		])
		
		const listItems = await waitForElements({ elementOrSelector: '.scaffold-layout__list-item'})
		let canClickToJob = true
		for (const listItem of listItems) {
			await closeApplicationSentModal()
			
			const linksElements = await waitForElements({
				elementOrSelector: '.artdeco-entity-lockup__title .job-card-container__link',
				timeout: 5000,
				contextNode: listItem
			})
			
			const jobNameLink = linksElements?.[0]
			if (!jobNameLink) {
				canClickToJob = false
			}
			const jobFooter = listItem.querySelector('[class*="footer"]')
			if (jobFooter && jobFooter.textContent.trim() === 'Applied') {
				canClickToJob = false
			}
			
			const companyNames = listItem.querySelectorAll('[class*="subtitle"]')
			const companyNamesArray = Array.from(companyNames).map(el => el.textContent.trim())
			const companyName = companyNamesArray?.[0] ?? ''
			
			const jobTitle = getJobTitle(jobNameLink)
			
			if (!jobTitle) {
				canClickToJob = false
			}
			console.log("job title:", jobTitle)
			
			if (titleSkipEnabled && titleSkipWords.some(word => jobTitle.includes(word.toLowerCase()))) {
				console.log('[titleSkipWords]: Skipping job:', jobTitle)
				canClickToJob = false
			}
			
			if (titleFilterEnabled && !titleFilterWords.some(word => jobTitle.includes(word.toLowerCase()))) {
				console.log('[title must contains]:', jobTitle)
				canClickToJob = false
			}
			jobNameLink.scrollIntoView({ block: 'center' })
			await addDelay(300)
			try {
				const mainContentElement = document.querySelector('.jobs-details__main-content')
				if (!mainContentElement) {
					canClickToJob = false
				}
			} catch (e) {
				console.log('Failed to find the main job content')
			}
			const isRunning = await checkAndPrepareRunState()
			if (!isRunning) {
				return
			}
			if (canClickToJob) {
				await clickJob(listItem, companyName, jobTitle, badWordsEnabled, jobNameLink)
			}
		}
		
		const isRunning = await checkAndPrepareRunState()
		if (isRunning) {
			console.log('Script is already running.')
			await goToNextPage()
		}
	} catch (error) {
		console.error('Error in runScript:', error)
		await stopScript()
	}
}

// if (window) {
// 	chrome.storage.local.get('autoApplyRunning').then(result => {
// 		if (result?.autoApplyRunning) {
// 			void stopScript()
// 		}
// 	})
// }

// content script listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// modals listerners
	if (message.action === 'showNotOnJobSearchAlert') {
		const modalWrapper = document.getElementById('notOnJobSearchOverlay')
		if (modalWrapper) {
			modalWrapper.style.display = 'flex'
			sendResponse({ success: true })
		} else {
			sendResponse({ success: false, error: 'onotOnJobSearchOverlay not found' })
		}
	} else if (message.action === 'showFormControlAlert') {
		const modalWrapper = document.getElementById('formControlOverlay')
		if (modalWrapper) {
			modalWrapper.style.display = 'flex'
		} else {
			sendResponse({ success: false, error: 'formControlOverlay not found' })
		}
	}
	// get current url listener provider
	
	
	if (message.action === 'getCurrentUrl') {
		sendResponse({ url: window.location.href })
	}
	if (message.action === 'showSavedLinksModal') {
		const modalWrapper = document.getElementById('savedLinksOverlay')
		if (modalWrapper) {
			const linksData = message.savedLinks
			modalWrapper.style.display = 'flex'
			const listEl = modalWrapper.querySelector('#savedLinksList')
			if (listEl) {
				listEl.innerHTML = ''
				Object.entries(linksData).forEach(([name, url]) => {
					const li = document.createElement('li')
					li.className = 'saved-link-item'
					const nameEl = document.createElement('span')
					nameEl.textContent = name
					li.appendChild(nameEl)
					const goButton = document.createElement('button')
					goButton.className = 'modal-button primary go-button'
					goButton.textContent = 'Go'
					goButton.addEventListener('click', () => {
						window.open(url, '_blank')
						chrome.runtime.sendMessage({ action: 'openTabAndRunScript', url: url }, (response) => {
							console.log('Tab open request sent:', response)
						})
					})
					li.appendChild(goButton)
					const deleteButton = document.createElement('button')
					deleteButton.className = 'modal-button danger delete-button'
					deleteButton.textContent = 'Delete'
					deleteButton.addEventListener('click', () => {
						chrome.storage.local.get('savedLinks', (result) => {
							const savedLinks = result.savedLinks || {}
							delete savedLinks[name]
							chrome.storage.local.set({ savedLinks }, () => {
								li.remove()
							})
						})
					})
					li.appendChild(deleteButton)
					listEl.appendChild(li)
				})
			}
		}
		sendResponse({ success: true })
	}
	
})


