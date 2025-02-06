// noinspection JSCheckFunctionSignatures

let defaultFields = {
	YearsOfExperience: '',
	City: '',
	FirstName: '',
	LastName: '',
	Email: '',
	PhoneNumber: ''
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

async function jobPanelScrollLittle() {
	const jobsPanel = document.querySelector('.jobs-search-results-list')
	if (jobsPanel) {
		
		const scrollPercentage = 0.03
		
		const scrollDistance = jobsPanel.scrollHeight * scrollPercentage
		
		jobsPanel.scrollTop += scrollDistance
		
		await addDelay()
	}
}

async function clickJob(listItem, companyName, jobTitle, badWordsEnabled) {
	
	const jobNameLink = listItem.querySelector(
		'.artdeco-entity-lockup__title .job-card-container__link'
	)
	
	if (!jobNameLink) {
		return
	}
	
	jobNameLink.click()
	await addDelay()
	if (badWordsEnabled) {
		const jobDetailsElement = document.querySelector('[class*="jobs-box__html-content"]');
		if (jobDetailsElement) {
			const jobContentText = jobDetailsElement.textContent.toLowerCase().trim();
			const badWords = await getStorageData('badWords', []);
			if (badWords.length > 0) {
				const matchedBadWord = badWords.find(word => jobContentText.includes(word.toLowerCase().trim()));
				if (matchedBadWord) {
					return;
				}
			}
		}
	}
	
	await runFindEasyApply(jobTitle, companyName)
	await jobPanelScrollLittle()
}

async function performInputFieldChecks() {
	const result = await sendMessage('getInputFieldConfig')
	
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
	
	const storedRadioButtons = await getStorageData('radioButtons', [])
	const radioFieldsets = document.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component="true"]')
	
	for (const fieldset of radioFieldsets) {
		const legendElement = fieldset.querySelector('legend')
		const questionTextElement = legendElement.querySelector('span[aria-hidden="true"]')
		const placeholderText = questionTextElement.textContent.trim()
		
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
				
				const options = Array.from(fieldset.querySelectorAll('input[type="radio"]')).map(radioButton => ({
					value: radioButton.value,
					selected: radioButton.checked
				}))
				
				const newRadioButtonInfo = {
					placeholderIncludes: placeholderText,
					defaultValue: firstRadioButton.value,
					count: 1,
					options: options
				}
				
				storedRadioButtons.push(newRadioButtonInfo)
				await setStorageData('radioButtons', storedRadioButtons)
			}
		}
	}
	await setStorageData('radioButtons', storedRadioButtons)
}

async function performDropdownChecks() {
	const dropdowns = document.querySelectorAll('.fb-dash-form-element select')
	
	dropdowns.forEach(dropdown => {
		const parentElement = dropdown.closest('.fb-dash-form-element') // Adjusted parent class
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


async function runApplyModel() {
	await addDelay(2000)
	await performSafetyReminderCheck()
	
	const continueApplyingButton = document.querySelector('button[aria-label="Continue applying"]')
	
	if (continueApplyingButton) {
		continueApplyingButton.click()
		await runApplyModel()
	}
	
	const nextButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Next'))
	const reviewButton = document.querySelector('button[aria-label="Review your application"]')
	const submitButton = document.querySelector('button[aria-label="Submit application"]')
	
	if (submitButton) {
		await addDelay()
		
		submitButton.click()
		
		await addDelay(2000)
		
		const modalCloseButton = document.querySelector('.artdeco-modal__dismiss')
		
		if (modalCloseButton) {
			modalCloseButton.click()
			return
		}
	}
	
	if (nextButton || reviewButton) {
		const buttonToClick = reviewButton || nextButton
		await runValidations()
		const isError = await checkForError()
		
		if (isError) {
			await terminateJobModel()
		} else {
			await addDelay(2000)
			buttonToClick.click()
			await runApplyModel()
		}
	}
}

async function runFindEasyApply(jobTitle, companyName) {
	await addDelay(1000)
	const currentPageLink = window.location.href
	const externalApplyElements = getElementsByXPath({ xpath: not_easy_apply_button })
	if (externalApplyElements.length > 0) {
		await chrome.runtime.sendMessage({
			action: 'externalApplyAction',
			data: { jobTitle, currentPageLink, companyName }
		})
	}
	
	const easyApplyElements = getElementsByXPath({ xpath: easy_apply_button })
	if (easyApplyElements.length > 0) {
		const buttonPromises = Array.from(easyApplyElements).map((button) => {
			return new Promise((resolve) => {
				button.click()
				resolve(runApplyModel())
			})
		})
		await Promise.race(buttonPromises)
	}
}


async function goToNextPage() {
	const nextButton = document.querySelector('.artdeco-pagination__pages .artdeco-pagination__indicator--number.active + li button')
	
	if (nextButton) {
		return new Promise(resolve => {
			setTimeout(() => {
				nextButton.click()
				resolve()
			}, 2000)
		}).then(runScript)
	}
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

async function jobPanelScroll() {
	const jobsPanel = document.querySelector('.jobs-search-results-list')
	if (jobsPanel) {
		jobsPanel.scrollTop = jobsPanel.scrollHeight
		await addDelay()
		jobsPanel.scrollTop = 0
	}
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
			console.warn('Chrome storage is not available, skipping checkAndPromptFields.')
			return false
		}
		
		const storedFields = await getStorageData('defaultFields', {})
		
		if (Object.keys(storedFields).length === 0) {
			await setStorageData('defaultFields', defaultFields)
			return false
		}
		
		const fieldsComplete = Object.values(storedFields).every(value => value)
		
		if (!fieldsComplete) {
			return false
		}
		
		defaultFields = storedFields
		return true
	} catch (e) {
		console.error('Error in checkAndPromptFields:', e)
		return false
	}
}

async function stopScript() {
	await sendMessage('stopAutoApply')
	await setStorageData('autoApplyRunning', false)
}

async function runScript() {
	try {
		const fieldsComplete = await checkAndPromptFields()
		if (!fieldsComplete) {
			void chrome.runtime.sendMessage({ action: 'openDefaultInputPage' })
			return
		}
		
		const titleSkipEnabled = await getStorageData('titleSkipEnabled', false)
		const titleFilterEnabled = await getStorageData('titleFilterEnabled', false)
		const badWordsEnabled = await getStorageData('badWordsEnabled', false)
		
		const limitReached = await checkLimitReached()
		if (limitReached) {
			const feedbackMessageElement = document.querySelector('.artdeco-inline-feedback__message')
			toggleBlinkingBorder(feedbackMessageElement)
			return
		}
		
		await jobPanelScroll()
		await addDelay()
		
		const listItems = document.querySelectorAll('.scaffold-layout__list-item')
		
		for (const listItem of listItems) {
			const autoApplyRunning = await getStorageData('autoApplyRunning', false)
			
			if (!autoApplyRunning) {
				break
			}
			
			const jobNameLink = listItem.querySelector('.job-card-container__link')
			if (!jobNameLink) {
				continue
			}
			
			// check if job is already applied
			const jobFooter = listItem.querySelector('[class*="footer"]')
			if (jobFooter) {
				const isApplied = jobFooter.textContent.trim() === 'Applied'
				if (isApplied) {
					continue
				}
			}
			
			const companyNames = listItem.querySelectorAll('[class*="subtitle"]')
			
			const companyNamesArray = Array.from(companyNames).map((companyNameElem) => {
				return companyNameElem.textContent.trim()
			})
			
			const companyName = companyNamesArray?.[0] ?? ''
			const visibleSpan = jobNameLink.querySelector('span[aria-hidden="true"]')
			const jobTitle = visibleSpan ? visibleSpan.textContent.trim().toLowerCase() : ''
			
			if (titleFilterEnabled || titleSkipEnabled) {
				const titleFilterWords = await getStorageData('titleFilterWords', [])
				const titleSkipWords = await getStorageData('titleSkipWords', [])
				const jobTitleMustContains = titleFilterWords.some(word => jobTitle.includes(word.toLowerCase()))
				const matchedSkipWord = titleSkipWords.find(word => jobTitle.includes(word.toLowerCase()))
				if (!jobTitleMustContains || matchedSkipWord) {
					jobNameLink.scrollIntoView({ block: 'center' })
					await addDelay()
					const autoApplyRunning = await getStorageData('autoApplyRunning', false)
					if (autoApplyRunning) {
						await goToNextPage()
					}
				}
			}
			
			jobNameLink.scrollIntoView({ block: 'center' })
			await addDelay()
			jobNameLink.click()
			await addDelay()
			
			const mainContentElement = document.querySelector('.jobs-details__main-content')
			if (!mainContentElement) {
				continue
			}
			
			try {
				await clickJob(listItem, companyName, jobTitle, badWordsEnabled)
			} catch (error) {
				console.error('Error in clickJob:', error)
			}
		}
		
		const autoApplyRunning = await getStorageData('autoApplyRunning', false)
		
		if (autoApplyRunning) {
			await goToNextPage()
		}
	} catch (error) {
		void stopScript()
	}
}

// when refresh auto apply return to off state
void stopScript()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'showNotOnJobSearchAlert') {
		const modalWrapper = document.getElementById('overlay-modal-wrapper')
		if (modalWrapper) {
			modalWrapper.style.display = 'flex'
			sendResponse({ success: true })
		} else {
			sendResponse({ success: false, error: 'overlay-modal-wrapper not found' })
		}
	}else if (message.action === 'showFormControlModal') {
		const modalWrapper = document.getElementById('overlay-modal-wrapper')
		if (modalWrapper) {
			modalWrapper.style.display = 'flex'
			sendResponse({ success: true })
		} else {
			sendResponse({ success: false, error: 'overlay-modal-wrapper not found' })
		}
	}
})