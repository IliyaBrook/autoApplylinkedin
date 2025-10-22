let autoApplyRunning = false;
let extensionContextCheckInterval = null;
let saveModalCheckInterval = null;
let isSaveModalBeingHandled = false;
let lastSaveModalHandleTime = 0;
let saveModalDetectedTime = 0;
let saveModalFailureCount = 0;
const MAX_SAVE_MODAL_WAIT_TIME = 30000;
const MAX_SAVE_MODAL_FAILURES = 5;

let defaultFields = {
	YearsOfExperience: "",
	City: "",
	FirstName: "",
	LastName: "",
	Email: "",
	PhoneNumber: "",
};

let prevSearchValue = "";

function isExtensionContextValidQuiet() {
	try {
		if (!chrome || !chrome.runtime || !chrome.storage) {
			return false;
		}
		
		if (!chrome.runtime.id) {
			return false;
		}
		
		return !(!chrome.runtime.sendMessage || !chrome.storage.local);
	} catch (error) {
		return false;
	}
}

function setAutoApplyRunningSilent(value) {
	if (!isExtensionContextValidQuiet()) {
		return;
	}
	
	try {
		void chrome.storage.local.set({autoApplyRunning: value});
	} catch (error) {
	}
}

async function updateScriptActivity() {
	try {
		if (isExtensionContextValidQuiet()) {
			await chrome.storage.local.set({lastScriptActivity: Date.now()});
		}
	} catch (error) {
		console.error("Failed to update script activity timestamp", error);
	}
}


async function setAutoApplyRunning(value, reason = "Unknown") {
	if (!isExtensionContextValidQuiet()) {
		return;
	}
	
	try {
		if (!isExtensionContextValidQuiet()) {
			return;
		}
		
		await chrome.storage.local.set({
			autoApplyRunning: value,
			lastScriptActivity: Date.now(),
		});
		
		if (!isExtensionContextValidQuiet()) {
			return null;
		}
		
	} catch (error) {
		if (isExtensionContextValidQuiet()) {
			console.trace(`Error reason: ${reason}`, error);
		}
	}
}

async function stopScript() {
	stopExtensionContextMonitoring();
	const modalWrapper = document.getElementById("scriptRunningOverlay");
	if (modalWrapper) {
		modalWrapper.style.display = "none";
	}
	
	await setAutoApplyRunning(false, "stopScript called");
	await chrome.storage.local.remove(["loopRestartUrl", "shouldRestartScript"]);
	
	try {
		if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== "function") {
			prevSearchValue = "";
			return;
		}
		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		if (tabs && tabs?.length > 0) {
			const currentTabId = tabs?.[0].id;
			await chrome.runtime.sendMessage({
				action: "stopAutoApply",
				tabId: currentTabId,
			});
		}
	} catch (error) {
		console.error("Error in stopScript", error);
	}
	prevSearchValue = "";
}

async function startScript() {
	if (!isExtensionContextValid()) {
		return false;
	}
	
	try {
		saveModalDetectedTime = 0;
		saveModalFailureCount = 0;
		
		await chrome.runtime.sendMessage({action: "autoApplyRunning"});
		await setAutoApplyRunning(true, "startScript called");
		startExtensionContextMonitoring();
		
		return true;
	} catch (error) {
		return false;
	}
}

async function checkAndPrepareRunState(allowAutoRecovery = false) {
	return new Promise(async (resolve) => {
		try {
			const result = await chrome.storage.local.get("autoApplyRunning");
			const isRunning = result && result.autoApplyRunning;
			
			if (isRunning) {
				resolve(true);
			} else {
				if (allowAutoRecovery) {
					const lastActivity = await chrome.storage.local.get(
						"lastScriptActivity"
					);
					const now = Date.now();
					const timeSinceLastActivity =
						now - (lastActivity?.lastScriptActivity || 0);
					
					if (timeSinceLastActivity < 30000) {
						await setAutoApplyRunning(
							true,
							"auto-recovery from recent activity"
						);
						resolve(true);
						return;
					}
				}
				
				resolve(false);
				prevSearchValue = "";
			}
		} catch (error) {
			resolve(false);
		}
	});
}

function getJobTitle(jobNameLink) {
	if (!jobNameLink) return "";
	let jobTitle;
	
	const visibleSpan = jobNameLink.querySelector('span[aria-hidden="true"]');
	if (visibleSpan && visibleSpan.textContent.trim().length > 0) {
		jobTitle = visibleSpan.textContent.trim();
	} else {
		jobTitle = jobNameLink.getAttribute("aria-label") || "";
		if (!jobTitle) {
			console.trace("Job title not found using both selectors");
		}
	}
	return jobTitle.toLowerCase();
}

async function clickDoneIfExist() {
	try {
		const modalWait = await waitForElements({
			elementOrSelector: ".artdeco-modal",
			timeout: 500,
		});
		const modal = modalWait?.[0];
		if (modal) {
			const xpathResult = getElementsByXPath({
				context: modal,
				xpath:
					'//button[.//*[contains(text(), "Done")] or contains(normalize-space(.), "Done")]',
			});
			if (xpathResult && xpathResult.length > 0) {
				const doneButton = xpathResult[0];
				await clickElement({elementOrSelector: doneButton});
				await addDelay(300);
			}
		}
	} catch (error) {
		console.trace("clickDoneIfExist error:" + error?.message);
	}
}

async function clickJob(listItem, companyName, jobTitle, badWordsEnabled) {
	return new Promise(async (resolve) => {
		try {
			await updateScriptActivity();
			
			const isRunning = await checkAndPrepareRunState();
			if (!isRunning) {
				
				resolve(null);
				return;
			}
			
			if (badWordsEnabled) {
				const jobDetailsElement = document.querySelector(
					'[class*="jobs-box__html-content"]'
				);
				if (jobDetailsElement) {
					const jobContentText = jobDetailsElement.textContent
						.toLowerCase()
						.trim();
					const response = await chrome.storage.local.get(["badWords"]);
					const badWords = response?.badWords;
					if (badWords?.length > 0) {
						let matchedBadWord = null;
						for (const badWord of badWords) {
							const regex = new RegExp(
								"\\b" + badWord.trim().replace(/\+/g, "\\+") + "\\b",
								"i"
							);
							if (regex.test(jobContentText)) {
								matchedBadWord = badWord;
								break;
							}
						}
						if (matchedBadWord) {
							resolve(null);
							return;
						}
					}
				}
			}
			
			await runFindEasyApply(jobTitle, companyName);
			resolve(null);
		} catch (error) {
			resolve(null);
		}
	});
}

async function handleCheckboxField(inputField, labelText) {
	try {
		const checkboxLabel = labelText.toLowerCase();
		
		const agreementKeywords = [
			"terms",
			"conditions",
			"agree",
			"i agree",
			"terms & conditions",
			"terms and conditions",
			"privacy policy",
			"accept",
			"consent",
			"acknowledge",
			"confirm",
			"verified",
		];
		
		const shouldCheck = agreementKeywords.some(
			(keyword) =>
				checkboxLabel.includes(keyword) ||
				checkboxLabel.includes(keyword.replace("&", "and"))
		);
		
		if (shouldCheck && !inputField.checked) {
			inputField.scrollIntoView({behavior: "smooth", block: "center"});
			await addDelay(200);
			inputField.checked = true;
			inputField.dispatchEvent(new Event("change", {bubbles: true}));
			inputField.dispatchEvent(new Event("click", {bubbles: true}));
			await addDelay(300);
		}
	} catch (error) {
		console.error("Error handling checkbox: ", error);
	}
}

async function performInputFieldChecks(context = document) {
	try {
		const result = await new Promise((resolve) => {
			chrome.runtime.sendMessage({action: "getInputFieldConfig"}, resolve);
		});
		
		const allInputFields = context.querySelectorAll(
			'input[type="text"]:not([placeholder*="Search"]):not([placeholder*="search"]), input[role="combobox"]:not([placeholder*="Search"]):not([placeholder*="search"]), textarea, select, input[type="checkbox"]'
		);
		
		for (const inputField of allInputFields) {
			if (inputField.type === "hidden" || inputField.offsetParent === null) {
				continue;
			}
			if (
				inputField.closest('[class*="search"]') ||
				inputField.closest('[class*="global-nav"]') ||
				inputField.closest('[class*="jobs-search-box"]') ||
				inputField.closest('[data-test="jobs-search-box"]') ||
				inputField.placeholder?.toLowerCase().includes("search") ||
				(inputField.placeholder?.toLowerCase().includes("company") &&
					inputField.placeholder?.toLowerCase().includes("title"))
			) {
				continue;
			}
			
			let label = null;
			let labelText = "";
			
			if (inputField.id) {
				label = document.querySelector(`label[for="${inputField.id}"]`);
			}
			
			if (!label) {
				label = inputField.closest("label");
			}
			
			if (!label) {
				const container = inputField.closest("div, fieldset, section, form");
				if (container) {
					label = container.querySelector("label");
				}
			}
			
			if (!label && inputField.getAttribute("aria-labelledby")) {
				const labelId = inputField.getAttribute("aria-labelledby");
				label = document.getElementById(labelId);
			}
			
			if (!label && inputField.placeholder) {
				labelText = inputField.placeholder.trim();
			}
			
			if (!label && !labelText) {
				const container = inputField.closest("div, fieldset, section");
				if (container) {
					const textElements = container.querySelectorAll(
						'span[aria-hidden="true"], span:not(.visually-hidden), div, p, h1, h2, h3, h4, h5, h6'
					);
					for (const textEl of textElements) {
						const text = textEl.textContent?.trim();
						if (
							text &&
							text.length > 0 &&
							text.length < 200 &&
							!text.includes("http") &&
							!text.includes("data-")
						) {
							labelText = text;
							break;
						}
					}
				}
			}
			
			if (label) {
				labelText = label.textContent?.trim() || label.innerText?.trim() || "";
			}
			
			if (labelText) {
				labelText = labelText.replace(/[*()]/g, "").trim();
			}
			
			if (!labelText || labelText.length < 2) {
				continue;
			}
			
			const isAutocompleteField = inputField.matches('[role="combobox"]');
			
			if (inputField.type === "checkbox") {
				await handleCheckboxField(inputField, labelText);
				continue;
			}
			const foundConfig = result.find(
				(config) => config.placeholderIncludes === labelText
			);
			if (foundConfig && foundConfig.defaultValue) {
				setNativeValue(inputField, foundConfig.defaultValue);
				await performFillForm(inputField);
			} else {
				const defaultFields = (await chrome.storage.local.get("defaultFields"))
					?.defaultFields;
				if (defaultFields && Object.keys(defaultFields).length > 0) {
					const valueFromDefault = findClosestField(defaultFields, labelText);
					if (!valueFromDefault) {
						const inputFieldConfigsArray = (
							await chrome.storage.local.get("inputFieldConfigs")
						)?.inputFieldConfigs;
						if (
							inputFieldConfigsArray &&
							Array.isArray(inputFieldConfigsArray) &&
							inputFieldConfigsArray.length > 0
						) {
							const inputFieldConfigsObj = inputFieldConfigsArray.reduce(
								(acc, {placeholderIncludes, defaultValue}) => {
									return {
										...acc,
										[placeholderIncludes]: defaultValue,
									};
								},
								{}
							);
							const valueFromConfigs = findClosestField(
								inputFieldConfigsObj,
								labelText
							);
							if (isAutocompleteField && valueFromConfigs) {
								await fillAutocompleteField(inputField, valueFromConfigs);
							} else {
								setNativeValue(inputField, valueFromConfigs);
							}
						}
					} else {
						if (isAutocompleteField) {
							await fillAutocompleteField(inputField, valueFromDefault);
						} else {
							setNativeValue(inputField, valueFromDefault);
						}
					}
				}
				if (!inputField.value) {
					await chrome.runtime.sendMessage({
						action: "updateInputFieldConfigsInStorage",
						data: labelText,
					});
					const isStopScript = Boolean(
						(await chrome.storage.local.get("stopIfNotExistInFormControl"))
							?.stopIfNotExistInFormControl
					);
					if (!isStopScript) {
						if (!foundConfig && inputField.value.trim() !== "") {
							continue;
						}
						setNativeValue(inputField, "");
						await performFillForm(inputField);
					} else {
						await stopScript();
						alert(
							`Field with label "${labelText}" is not filled. Please fill it in the form control settings.`
						);
						return;
					}
				}
			}
		}
	} catch (error) {
		console.trace("performInputField not completed: " + error?.message);
	}
}

async function performFillForm(inputField) {
	try {
		const keyboardEvents = ["keydown", "keypress", "keyup"];
		const inputEvents = ["input"];
		
		for (const eventType of keyboardEvents) {
			try {
				const keyboardEvent = new KeyboardEvent(eventType, {
					bubbles: true,
					cancelable: true,
					key: "",
					code: "",
					keyCode: 0,
					which: 0
				});
				inputField.dispatchEvent(keyboardEvent);
			} catch (error) {
				inputField.dispatchEvent(
					new Event(eventType, {bubbles: true, cancelable: true})
				);
			}
			await addDelay(100);
		}
		
		for (const eventType of inputEvents) {
			inputField.dispatchEvent(
				new Event(eventType, {bubbles: true, cancelable: true})
			);
			await addDelay(100);
		}
		
		inputField.dispatchEvent(new Event("change", {bubbles: true}));
		await addDelay(200);
	} catch (error) {
		console.error("Error in performFillForm, continuing...", error?.message);
	}
}

async function performRadioButtonChecks() {
	const storedRadioButtons = await new Promise((resolve) => {
		chrome.storage.local.get("radioButtons", (result) => {
			resolve(result.radioButtons || []);
		});
	});
	
	const radioFieldsets = document.querySelectorAll(
		'fieldset[data-test-form-builder-radio-button-form-component="true"]'
	);
	
	for (const fieldset of radioFieldsets) {
		const legendElement = fieldset.querySelector("legend");
		const questionTextElement = legendElement.querySelector(
			'span[aria-hidden="true"]'
		);
		const placeholderText =
			questionTextElement?.textContent.trim() ||
			legendElement.textContent.trim();
		
		const storedRadioButtonInfo = storedRadioButtons.find(
			(info) => info.placeholderIncludes === placeholderText
		);
		
		if (storedRadioButtonInfo) {
			const radioButtonWithValue = fieldset.querySelector(
				`input[type="radio"][value="${storedRadioButtonInfo.defaultValue}"]`
			);
			
			if (radioButtonWithValue) {
				radioButtonWithValue.checked = true;
				radioButtonWithValue.dispatchEvent(
					new Event("change", {bubbles: true})
				);
				await addDelay(500);
			}
			
			storedRadioButtonInfo.count++;
			if (
				!("createdAt" in storedRadioButtonInfo) ||
				!storedRadioButtonInfo.createdAt
			) {
				storedRadioButtonInfo.createdAt = Date.now();
			}
		} else {
			const firstRadioButton = fieldset.querySelector('input[type="radio"]');
			if (firstRadioButton) {
				firstRadioButton.checked = true;
				firstRadioButton.dispatchEvent(new Event("change", {bubbles: true}));
				await addDelay(500);
				
				const options = Array.from(
					fieldset.querySelectorAll('input[type="radio"]')
				).map((radioButton) => {
					const labelElement = fieldset.querySelector(
						`label[for="${radioButton.id}"]`
					);
					let text = labelElement?.textContent.trim();
					
					if (!text) {
						const parentElement = radioButton.parentElement;
						const textElement =
							parentElement?.querySelector("span") ||
							parentElement?.querySelector("div");
						text = textElement?.textContent?.trim() || radioButton.value;
					}
					
					return {
						value: radioButton.value,
						text: text,
						selected: radioButton.checked,
					};
				});
				
				const newRadioButtonInfo = {
					placeholderIncludes: placeholderText,
					defaultValue: firstRadioButton.value,
					count: 1,
					options: options,
					createdAt: Date.now(),
				};
				
				storedRadioButtons.push(newRadioButtonInfo);
				
				await chrome.storage.local.set({radioButtons: storedRadioButtons});
			}
			const isStopScript = Boolean(
				(await chrome.storage.local.get("stopIfNotExistInFormControl"))
					?.stopIfNotExistInFormControl
			);
			if (isStopScript) {
				await stopScript();
				alert(
					`Field with label "${placeholderText}" is not filled. Please fill it in the form control settings.`
				);
				return;
			}
		}
	}
	
	await chrome.storage.local.set({radioButtons: storedRadioButtons});
}

async function performDropdownChecks() {
	const storedDropdowns = await new Promise((resolve) => {
		chrome.storage.local.get("dropdowns", (result) => {
			resolve(result.dropdowns || []);
		});
	});
	
	const dropdowns = document.querySelectorAll(".fb-dash-form-element select");
	dropdowns.forEach((dropdown, index) => {
		const parentElement = dropdown.closest(".fb-dash-form-element");
		if (parentElement) {
			const labelElement = parentElement.querySelector("label");
			let labelText = null;
			
			if (labelElement) {
				const ariaHiddenSpan = labelElement.querySelector(
					'span[aria-hidden="true"]'
				);
				labelText = ariaHiddenSpan?.textContent.trim();
				
				if (!labelText) {
					labelText = labelElement.innerText.trim();
				}
			}
			
			labelText = labelText || `Dropdown ${index}`;
			
			const secondOption = dropdown.options[1];
			if (secondOption && dropdown.selectedIndex < 1) {
				secondOption.selected = true;
				dropdown.dispatchEvent(new Event("change", {bubbles: true}));
			}
			
			const options = Array.from(dropdown.options).map((option) => ({
				value: option.value,
				text: option.textContent.trim(),
				selected: option.selected,
			}));
			
			const storedDropdownInfo = storedDropdowns.find(
				(info) => info.placeholderIncludes === labelText
			);
			
			if (storedDropdownInfo) {
				const selectedValue = storedDropdownInfo.options.find(
					(option) => option.selected
				)?.value;
				
				Array.from(dropdown.options).forEach((option) => {
					option.selected = option.value === selectedValue;
				});
				
				dropdown.dispatchEvent(new Event("change", {bubbles: true}));
				
				storedDropdownInfo.count++;
			} else {
				const newDropdownInfo = {
					placeholderIncludes: labelText,
					count: 1,
					options: options.map((option) => ({
						value: option.value,
						text: option.text,
						selected: option.selected,
					})),
				};
				
				storedDropdowns.push(newDropdownInfo);
			}
		}
	});
	
	void chrome.storage.local.set({dropdowns: storedDropdowns});
}

async function performCheckBoxFieldCityCheck() {
	const checkboxFieldsets = document.querySelectorAll(
		'fieldset[data-test-checkbox-form-component="true"]'
	);
	for (const fieldset of checkboxFieldsets) {
		const firstCheckbox = fieldset.querySelector('input[type="checkbox"]');
		if (firstCheckbox) {
			firstCheckbox.checked = true;
			firstCheckbox.dispatchEvent(new Event("change", {bubbles: true}));
			await addDelay(500);
		}
	}
}

async function performSafetyReminderCheck() {
	const modal = document.querySelector(".artdeco-modal");
	if (modal) {
		const modalHeader = modal.querySelector(".artdeco-modal__header");
		if (
			modalHeader &&
			modalHeader.textContent.includes("Job search safety reminder")
		) {
			const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
			if (dismissButton) {
				dismissButton.click();
			}
		}
	}
}

async function validateAndCloseConfirmationModal() {
	const modal = document.querySelector(".artdeco-modal");
	if (modal) {
		const modalHeader = modal.querySelector(".artdeco-modal__header");
		const modalContent = modal.querySelector(".artdeco-modal__content");
		
		if (
			(modalHeader &&
				modalHeader.textContent.includes("Save this application?")) ||
			(modalContent &&
				modalContent.textContent.includes(
					"Save to return to this application later"
				))
		) {
			const discardButton = modal.querySelector(
				"button[data-test-dialog-secondary-btn]"
			);
			if (
				discardButton &&
				discardButton.textContent.trim().includes("Discard")
			) {
				discardButton.click();
				await addDelay(1000);
				return true;
			}
			
			const dismissButton = modal.querySelector(".artdeco-modal__dismiss");
			if (dismissButton) {
				dismissButton.click();
				await addDelay(1000);
				return true;
			}
			
			
		}
	}
	
	return false;
}

async function handleSaveApplicationModal() {
	const currentTime = Date.now();
	
	if (isSaveModalBeingHandled) {
		return false;
	}
	
	if (currentTime - lastSaveModalHandleTime < 2000) {
		return false;
	}
	
	const saveModal = document.querySelector(
		'[data-test-modal=""][role="alertdialog"]'
	);
	
	if (!saveModal) {
		return false;
	}
	
	const titleElement = saveModal.querySelector("h2[data-test-dialog-title]");
	if (
		!titleElement ||
		!titleElement.textContent.includes("Save this application?")
	) {
		return false;
	}
	
	isSaveModalBeingHandled = true;
	lastSaveModalHandleTime = currentTime;
	
	if (saveModalDetectedTime === 0) {
		saveModalDetectedTime = currentTime;
		saveModalFailureCount = 0;
	}
	
	const waitTime = currentTime - saveModalDetectedTime;
	if (waitTime > MAX_SAVE_MODAL_WAIT_TIME) {
		await stopScript();
		return false;
	}
	
	if (saveModalFailureCount >= MAX_SAVE_MODAL_FAILURES) {
		
		await stopScript();
		return false;
	}
	
	try {
		const discardButton = saveModal.querySelector(
			"button[data-test-dialog-secondary-btn]"
		);
		if (
			discardButton &&
			discardButton.textContent.trim().toLowerCase().includes("discard")
		) {
			discardButton.click();
			await addDelay(1500);
			
			const modalStillExists = document.querySelector(
				'[data-test-modal=""][role="alertdialog"]'
			);
			if (!modalStillExists) {
				saveModalDetectedTime = 0;
				saveModalFailureCount = 0;
				return true;
			} else {
				saveModalFailureCount++;
			}
		}
		
		const dismissButton = saveModal.querySelector(
			'button[aria-label="Dismiss"]'
		);
		if (dismissButton) {
			
			
			dismissButton.click();
			await addDelay(1500);
			
			const modalStillExists = document.querySelector(
				'[data-test-modal=""][role="alertdialog"]'
			);
			if (!modalStillExists) {
				
				saveModalDetectedTime = 0;
				saveModalFailureCount = 0;
				return true;
			} else {
				
				saveModalFailureCount++;
			}
		}
		
		saveModalFailureCount++;
		return false;
	} catch (error) {
		
		saveModalFailureCount++;
		return false;
	} finally {
		setTimeout(() => {
			isSaveModalBeingHandled = false;
		}, 1000);
	}
}

function checkIfAlreadyApplied(textContent) {
	const lowerText = textContent.toLowerCase();
	return (
		lowerText.includes("applied") &&
		(lowerText.includes("ago") ||
			lowerText.includes("minutes") ||
			lowerText.includes("hours") ||
			lowerText.includes("days"))
	);
}

async function checkForFormValidationError() {
	const feedbackMessageElement = document.querySelector(
		".artdeco-inline-feedback__message"
	);
	
	if (!feedbackMessageElement) {
		return false;
	}
	
	const textContent = feedbackMessageElement.textContent;
	
	if (checkIfAlreadyApplied(textContent)) {
		return false;
	}
	
	if (
		textContent.toLowerCase().includes("exceeded") &&
		textContent.toLowerCase().includes("limit")
	) {
		return false;
	}
	
	const validationErrors = [
		"required",
		"must",
		"invalid",
		"error",
		"cannot",
		"please",
		"field",
	];
	
	return validationErrors.some((error) =>
		textContent.toLowerCase().includes(error)
	);
}

async function terminateJobModel(context = document) {
	if (!isSaveModalBeingHandled) {
		const saveModalHandled = await handleSaveApplicationModal();
		if (saveModalHandled) {
			
			return;
		}
	}
	
	const dismissButton = context.querySelector('button[aria-label="Dismiss"]');
	if (dismissButton) {
		
		dismissButton.click();
		dismissButton.dispatchEvent(new Event("change", {bubbles: true}));
		await addDelay(1000);
		
		if (!isSaveModalBeingHandled) {
			const saveModalAfterDismiss = await handleSaveApplicationModal();
			if (saveModalAfterDismiss) {
				
				return;
			}
		}
		
		const discardButton = Array.from(
			document.querySelectorAll("button[data-test-dialog-secondary-btn]")
		).find((button) => button.textContent.trim() === "Discard");
		if (discardButton) {
			
			discardButton.click();
			discardButton.dispatchEvent(new Event("change", {bubbles: true}));
			await addDelay(500);
		}
	}
}

async function performUniversalCheckboxChecks(context = document) {
	try {
		const checkboxSelectors = [
			'input[type="checkbox"]',
			'[data-test-text-selectable-option] input[type="checkbox"]',
			"[data-test-text-selectable-option__input]",
		];
		
		let allCheckboxes = [];
		for (const selector of checkboxSelectors) {
			const checkboxes = context.querySelectorAll(selector);
			allCheckboxes.push(...Array.from(checkboxes));
		}
		
		allCheckboxes = [...new Set(allCheckboxes)];
		
		
		for (const checkbox of allCheckboxes) {
			if (checkbox.type !== "checkbox") continue;
			
			let labelText = "";
			
			if (checkbox.id) {
				const label = context.querySelector(`label[for="${checkbox.id}"]`);
				if (label) {
					labelText = label.textContent?.trim() || "";
				}
			}
			
			if (!labelText) {
				const dataTestLabel = checkbox.getAttribute(
					"data-test-text-selectable-option__input"
				);
				if (dataTestLabel) {
					labelText = dataTestLabel.replace(/&amp;/g, "&").trim();
				}
			}
			
			if (!labelText) {
				const closestLabel = checkbox
					.closest("div, span, fieldset")
					?.querySelector("label");
				if (closestLabel) {
					labelText = closestLabel.textContent?.trim() || "";
				}
			}
			
			if (!labelText) {
				labelText = checkbox.getAttribute("aria-label") || "";
			}
			
			if (!labelText) {
				const container = checkbox.closest("div, span, fieldset");
				if (container) {
					const textNodes = container.querySelectorAll("span, div, label, p");
					for (const node of textNodes) {
						const text = node.textContent?.trim();
						if (text && text.length > 2 && text.length < 200) {
							labelText = text;
							break;
						}
					}
				}
			}
			
			if (labelText && labelText.length > 1) {
				await handleCheckboxField(checkbox, labelText);
			}
		}
	} catch (error) {
		console.error("Error in performUniversalCheckboxChecks", error);
	}
}

async function runValidations() {
	try {
		const saveModalHandled = await handleSaveApplicationModal();
		if (saveModalHandled) {
			return;
		}
		
		await validateAndCloseConfirmationModal();
		
		const applyModal = document.querySelector(".artdeco-modal") || document;
		await performInputFieldChecks(applyModal);
		await performUniversalCheckboxChecks(applyModal);
		await performRadioButtonChecks();
		await performDropdownChecks();
		await performCheckBoxFieldCityCheck();
		await handleSaveApplicationModal();
	} catch (error) {
		console.error("Error in runValidations, continuing...", error?.message);
	}
}

async function selectCvFile(applyModal) {
	try {
		const attachmentElements = applyModal.querySelectorAll(".ui-attachment");
		if (!attachmentElements || attachmentElements.length === 0) {
			return;
		}
		const storageData = await chrome.storage.local.get(['cvFiles', 'selectedCvFile']);
		const selectedCvId = storageData.selectedCvFile;
		
		if (!selectedCvId) {
			return;
		}
		
		const cvFiles = storageData.cvFiles;
		if (!cvFiles || !Array.isArray(cvFiles) || cvFiles.length === 0) {
			return;
		}
		
		const selectedFile = cvFiles.find(f => f.id === selectedCvId);
		if (!selectedFile || !selectedFile.name) {
			return;
		}
		
		const targetCvName = selectedFile.name.toLowerCase().trim();
		
		for (const attachmentElement of attachmentElements) {
			const elementText = attachmentElement.textContent.toLowerCase().trim();
			
			if (elementText.includes(targetCvName)) {
				attachmentElement.scrollIntoView({behavior: "smooth", block: "center"});
				await addDelay(300);
				attachmentElement.click();
				await addDelay(500);
				return;
			}
		}
	} catch (error) {
		console.error("Error in selectCvFile:", error);
	}
}

async function uncheckFollowCompany() {
	const followCheckboxWait = await waitForElements({
		elementOrSelector: "#follow-company-checkbox",
		timeout: 3000,
	});
	
	const followCheckbox = followCheckboxWait?.[0];
	if (followCheckbox?.checked) {
		followCheckbox?.scrollIntoView({block: "center"});
		await addDelay(300);
		followCheckbox.checked = false;
		const changeEvent = new Event("change", {
			bubbles: true,
			cancelable: true,
		});
		
		followCheckbox.dispatchEvent(changeEvent);
		await addDelay(200);
	}
}

const runApplyModelLogic = async () => {
	{
		await addDelay();
		await performSafetyReminderCheck();
		
		const saveModalHandled = await handleSaveApplicationModal();
		if (saveModalHandled) {
			return;
		}
		const applyModalWait = await waitForElements({
			elementOrSelector: ".artdeco-modal",
			timeout: 3000,
		});
		
		if (Array.isArray(applyModalWait)) {
			const applyModal = applyModalWait[0];
			const continueApplyingButton = applyModal?.querySelector(
				'button[aria-label="Continue applying"]'
			);
			
			if (continueApplyingButton) {
				continueApplyingButton?.scrollIntoView({block: "center"});
				await addDelay(300);
				continueApplyingButton.click();
				await runApplyModel();
			}
			
			const nextButton =
				applyModal?.querySelectorAll &&
				Array.from(applyModal.querySelectorAll("button")).find((button) =>
					button.textContent.includes("Next")
				);
			const reviewButtonWait = await waitForElements({
				elementOrSelector: 'button[aria-label="Review your application"]',
				timeout: 2000,
			});
			const reviewButton = reviewButtonWait?.[0];
			const submitButtonWait = await waitForElements({
				elementOrSelector: 'button[aria-label="Submit application"]',
				timeout: 2000,
			});
			const submitButton = submitButtonWait?.[0];
			
			if (submitButton) {
				await uncheckFollowCompany();
				submitButton?.scrollIntoView({block: "center"});
				await addDelay(300);
				
				const isStillRunning = await checkAndPrepareRunState();
				if (!isStillRunning) {
					return;
				}
				
				submitButton.click();
				await addDelay(2000);
				await handleSaveApplicationModal();
				const isStillRunning2 = await checkAndPrepareRunState();
				if (!isStillRunning2) {
					return;
				}
				
				const modalCloseButton = document.querySelector(
					".artdeco-modal__dismiss"
				);
				if (modalCloseButton) {
					modalCloseButton?.scrollIntoView({block: "center"});
					await addDelay(300);
					modalCloseButton.click();
				}
				await clickDoneIfExist();
			}
			
			if (nextButton || reviewButton) {
				const buttonToClick = reviewButton || nextButton;
				await selectCvFile(applyModal);
				await runValidations();
				const isError = await checkForFormValidationError();
				if (isError) {
					await terminateJobModel();
				} else {
					buttonToClick?.scrollIntoView({block: "center"});
					await addDelay();
					buttonToClick.click();
					await addDelay(1000);
					const saveModalAfterNext = await handleSaveApplicationModal();
					if (saveModalAfterNext) {
						console.info("Save modal detected after next button click");
					}
					await runApplyModel();
				}
				
				if (
					document
						?.querySelector("button[data-test-dialog-secondary-btn]")
						?.innerText.includes("Discard")
				) {
					await terminateJobModel();
				  return null;
				}
			}
		}
		
		await handleSaveApplicationModal();
		
		if (!document?.querySelector(".artdeco-modal")) {
			return null
		} else {
			const modalsToClose = Array.from(
				document.querySelectorAll(".artdeco-modal")
			);
			for (const modal of modalsToClose) {
				await addDelay(1000);
				await terminateJobModel(modal);
			}
		}
		await addDelay(1000);
		
		const artdecoModal = document.querySelector(
			'[class*="artdeco-modal"]'
		);
		if (artdecoModal) {
			const buttons = artdecoModal.querySelectorAll("button");
			for (const button of buttons) {
				if ("textContent" in button && button?.textContent?.trim()?.includes("No thanks")) {
					button.click();
					return null;
				}
			}
			return null;
		}
	}
}

async function runApplyModel() {
	try {
		return await Promise.race([
			runApplyModelLogic(),
			new Promise((resolve) => setTimeout(() => resolve(null), 30000))
		]);
	} catch (error) {
		console.error("runApplyModel critical error", error);
	}
}

async function runFindEasyApply(jobTitle, companyName) {
	try {
		await addDelay(1000);
		const saveModalHandled = await handleSaveApplicationModal();
		if (saveModalHandled) {
			return null;
		}
		
		const alreadyAppliedElement = document.querySelector(
			".artdeco-inline-feedback__message"
		);
		if (alreadyAppliedElement) {
			const textContent = alreadyAppliedElement.textContent;
			if (checkIfAlreadyApplied(textContent)) {
				return null;
			}
		}
		
		const currentPageLink = window.location.href;
		
		if (!chrome || !chrome.runtime) {
			return null;
		}
		
		const externalApplyElements = getElementsByXPath({
			xpath: not_easy_apply_button,
		});
		
		if (externalApplyElements.length > 0) {
			await chrome.runtime.sendMessage({
				action: "externalApplyAction",
				data: {jobTitle, currentPageLink, companyName},
			});
		}
		
		const easyApplyButton = getVisibleElementByXPath({
			xpath: easy_apply_button,
		});
		
		if (easyApplyButton) {
			const result = await checkAndPrepareRunState();
			if (result) {
				easyApplyButton.click();
				await runApplyModel();
			}
		}
		await handleSaveApplicationModal();
		
		return null;
	} catch (error) {
		return null;
	}
}

let currentPage = "";

function toggleBlinkingBorder(element) {
	let count = 0;
	const intervalId = setInterval(() => {
		element.style.border = count % 2 === 0 ? "2px solid red" : "none";
		count++;
		if (count === 10) {
			clearInterval(intervalId);
			element.style.border = "none";
		}
	}, 500);
}

async function checkLimitReached() {
	return new Promise((resolve) => {
		const feedbackMessageElement = document.querySelector(
			".artdeco-inline-feedback__message"
		);
		
		if (feedbackMessageElement) {
			const textContent = feedbackMessageElement.textContent;
			
			const searchString = "You've exceeded the daily application limit";
			
			resolve(textContent.includes(searchString));
		} else {
			resolve(false);
		}
	});
}

function isChromeStorageAvailable() {
	return (
		typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
	);
}

async function checkAndPromptFields() {
	try {
		if (!isChromeStorageAvailable()) {
			return false;
		}
		const response = await chrome.storage.local.get("defaultFields");
		return response?.defaultFields;
	} catch (error) {
		console.trace("Error in checkAndPromptFields: " + error?.message);
		return false;
	}
}

async function fillSearchFieldIfEmpty() {
	if (!(await checkAndPrepareRunState())) return;
	const inputElement = document?.querySelector(
		'[id*="jobs-search-box-keyword"]'
	);
	if (prevSearchValue && inputElement) {
		if (!inputElement.value.trim()) {
			inputElement.focus();
			await addDelay(2000);
			inputElement.value = prevSearchValue;
			const inputEvent = new Event("input", {bubbles: true});
			await addDelay(100);
			inputElement.dispatchEvent(inputEvent);
			await addDelay(100);
			const changeEvent = new Event("change", {bubbles: true});
			await addDelay(100);
			inputElement.dispatchEvent(changeEvent);
			await addDelay(100);
			const lists = document?.querySelectorAll(
				'[class*="typeahead-results"] > li'
			);
			if (lists) {
				for (const list of lists) {
					if ("click" in list) {
						list.click();
					}
				}
			}
		}
	}
}

async function closeApplicationSentModal() {
	const saveModalHandled = await handleSaveApplicationModal();
	if (saveModalHandled) {
		return;
	}
	
	const modal = document.querySelector(".artdeco-modal");
	
	if (
		modal?.textContent.includes("Application sent") &&
		modal.textContent.includes("Your application was sent to")
	) {
		modal.querySelector(".artdeco-modal__dismiss")?.click();
		await addDelay(500);
	}
}

let isNavigating = false;

async function handleLoopRestart() {
	
	try {
		const {lastJobSearchUrl, loopRunningDelay} =
			await chrome.storage.local.get(["lastJobSearchUrl", "loopRunningDelay"]);
		
		const delayInMs = (loopRunningDelay || 0) * 60 * 1000;
		
		if (delayInMs > 0) {
			await addDelay(delayInMs);
		}
		
		const urlToUse = lastJobSearchUrl || window.location.href;
		const url = new URL(urlToUse);
		url.searchParams.set("start", "1");
		
		const baseSearchParams = new URLSearchParams();
		const importantParams = [
			"keywords",
			"geoId",
			"f_TPR",
			"sortBy",
			"origin",
			"refresh",
		];
		
		importantParams.forEach((param) => {
			if (url.searchParams.has(param)) {
				baseSearchParams.set(param, url.searchParams.get(param));
			}
		});
		baseSearchParams.set("start", "1");
		
		const newUrl = `${url.origin}${
			url.pathname
		}?${baseSearchParams.toString()}`;
		
		if (chrome.runtime?.id) {
			await chrome.storage.local.set({
				loopRestartUrl: newUrl,
				shouldRestartScript: true,
			});
		}
		
		window.location.href = newUrl;
	} catch (error) {
		
		void stopScript();
	}
}

async function goToNextPage() {
	await addDelay();
	if (isNavigating) {
		return false;
	}
	
	isNavigating = true;
	
	try {
		const isStillRunning = await checkAndPrepareRunState();
		if (!isStillRunning) {
			isNavigating = false;
			return false;
		}
		
		const pagination = document?.querySelector(".jobs-search-pagination");
		const paginationPage = pagination?.querySelector(
			".jobs-search-pagination__indicator-button--active"
		)?.innerText;
		const nextButton = pagination?.querySelector("button[aria-label*='next']");
		
		if (!nextButton) {
			isNavigating = false;
			const {loopRunning} = await chrome.storage.local.get("loopRunning");
			if (loopRunning) {
				await handleLoopRestart();
			} else {
				stopScript();
			}
			return false;
		}
		
		nextButton.scrollIntoView({behavior: "smooth", block: "center"});
		await addDelay(1000);
		nextButton.click();
		
		try {
			await waitForElements({
				elementOrSelector: ".scaffold-layout__list-item",
				timeout: 5000,
			});
		} catch (error) {
		
		}
		
		await addDelay(1000);
		const scrollElement = document?.querySelector(
			".scaffold-layout__list > div"
		);
		if (scrollElement) {
			scrollElement?.scrollTo({
				top: scrollElement.scrollHeight,
			});
		}
		
		await new Promise((resolve) => {
			const checkPageLoaded = () => {
				if (document.readyState === "complete") {
					resolve();
				} else {
					setTimeout(checkPageLoaded, 500);
				}
			};
			checkPageLoaded();
		});
		
		currentPage = paginationPage;
		isNavigating = false;
		
		await runScript();
		return true;
	} catch (error) {
		
		isNavigating = false;
		return false;
	}
}

async function runScript() {
	try {
		await addDelay(3000);
		if (!isExtensionContextValid()) {
			return;
		}
		
		const currentUrl = window.location.href;
		
		if (
			currentUrl.includes("/jobs/search/") &&
			currentUrl.includes("keywords=")
		) {
			await chrome.storage.local.set({lastJobSearchUrl: currentUrl});
		}
		
		const scriptStarted = await startScript();
		if (!scriptStarted) {
			return;
		}
		
		await fillSearchFieldIfEmpty();
		
		const isRunning = await checkAndPrepareRunState(true);
		if (!isRunning) {
			return;
		}
		
		if (!isExtensionContextValid()) {
			return;
		}
		
		await setAutoApplyRunning(true, "runScript reactivation");
		const fieldsComplete = await checkAndPromptFields();
		if (!fieldsComplete) {
			await chrome.runtime.sendMessage({action: "openDefaultInputPage"});
			return;
		}
		
		const limitReached = await checkLimitReached();
		if (limitReached) {
			const feedbackMessageElement = document.querySelector(
				".artdeco-inline-feedback__message"
			);
			toggleBlinkingBorder(feedbackMessageElement);
			return;
		}
		
		const {
			titleSkipEnabled,
			titleFilterEnabled,
			badWordsEnabled,
			titleFilterWords,
			titleSkipWords,
		} = await chrome.storage.local.get([
			"titleSkipEnabled",
			"titleFilterEnabled",
			"badWordsEnabled",
			"titleFilterWords",
			"titleSkipWords",
		]);
		
		const listItems = await waitForElements({
			elementOrSelector: ".scaffold-layout__list-item",
		});
		
		
		for (let i = 0; i < listItems.length; i++) {
			const listItem = listItems[i];
			
			if (i % 5 === 0 && !isExtensionContextValid()) {
				return;
			}
			
			const stillRunning = await checkAndPrepareRunState();
			if (!stillRunning) {
				return;
			}
			
			await addDelay(300);
			let canClickToJob = true;
			
			const stillRunning2 = await checkAndPrepareRunState();
			if (!stillRunning2) {
				return;
			}
			
			await closeApplicationSentModal();
			await handleSaveApplicationModal();
			
			const linksElements = await waitForElements({
				elementOrSelector:
					".artdeco-entity-lockup__title .job-card-container__link",
				timeout: 5000,
				contextNode: listItem,
			});
			const jobNameLink = linksElements?.[0];
			if (!jobNameLink) {
				canClickToJob = false;
			} else {
				jobNameLink?.scrollIntoView({behavior: "smooth", block: "center"});
			}
			
			const jobFooter = listItem.querySelector('[class*="footer"]');
			if (jobFooter && jobFooter.textContent.trim() === "Applied") {
				canClickToJob = false;
			}
			
			const companyNames = listItem.querySelectorAll('[class*="subtitle"]');
			const companyNamesArray = Array.from(companyNames).map((el) =>
				el.textContent.trim()
			);
			
			const companyName = companyNamesArray?.[0] ?? "";
			const jobTitle = getJobTitle(jobNameLink);
			
			if (!jobTitle) {
				canClickToJob = false;
			}
			
			if (titleSkipEnabled) {
				const matchedSkipWord = titleSkipWords.find((word) =>
					jobTitle.toLowerCase().includes(word.toLowerCase())
				);
				if (matchedSkipWord) {
					canClickToJob = false;
				}
			}
			if (titleFilterEnabled) {
				const matchedFilterWord = titleFilterWords.find((word) =>
					jobTitle.toLowerCase().includes(word.toLowerCase())
				);
				if (!matchedFilterWord) {
					
					canClickToJob = false;
				}
			}
			
			const stillRunning3 = await checkAndPrepareRunState();
			if (!stillRunning3) {
				return;
			}
			
			if (canClickToJob) {
				try {
					await clickElement({elementOrSelector: jobNameLink});
					const stillRunning4 = await checkAndPrepareRunState();
					if (!stillRunning4) {
						return;
					}
				} catch (error) {
					console.error("Error clicking job link", error);
				}
			}
			
			try {
				const mainContentElementWait = await waitForElements({
					elementOrSelector: ".jobs-details__main-content",
				});
				const mainContentElement = mainContentElementWait?.[0];
				if (!mainContentElement) {
					canClickToJob = false;
				}
			} catch (e) {
				console.error("Failed to find main job content", e);
			}
			
			const stillRunning5 = await checkAndPrepareRunState();
			if (!stillRunning5) {
				return;
			}
			
			if (canClickToJob) {
				await clickJob(listItem, companyName, jobTitle, badWordsEnabled);
				await handleSaveApplicationModal();
			}
		}
		
		const finalRunCheck = await checkAndPrepareRunState();
		if (finalRunCheck) {
			await goToNextPage();
		}
	} catch (error) {
		const message = "Error in runScript: " + error?.message + " script stopped";
		console.trace(message);
		await stopScript();
	}
	
	
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "showNotOnJobSearchAlert") {
		const modalWrapper = document.getElementById("notOnJobSearchOverlay");
		if (modalWrapper) {
			modalWrapper.style.display = "flex";
			sendResponse({success: true});
		} else {
			sendResponse({
				success: false,
				error: "onotOnJobSearchOverlay not found",
			});
		}
	} else if (message.action === "showFormControlAlert") {
		const modalWrapper = document.getElementById("formControlOverlay");
		if (modalWrapper) {
			modalWrapper.style.display = "flex";
		} else {
			sendResponse({success: false, error: "formControlOverlay not found"});
		}
	} else if (message.action === "checkScriptRunning") {
		chrome.storage.local.get("autoApplyRunning", (result) => {
			sendResponse({isRunning: Boolean(result?.autoApplyRunning)});
		});
		return true;
	}
	if (message.action === "getCurrentUrl") {
		sendResponse({url: window.location.href});
	}
	if (message.action === "showSavedLinksModal") {
		const modalWrapper = document.getElementById("savedLinksOverlay");
		if (modalWrapper) {
			const linksData = message.savedLinks;
			modalWrapper.style.display = "flex";
			const listEl = modalWrapper.querySelector("#savedLinksList");
			if (listEl) {
				listEl.innerHTML = "";
				Object.entries(linksData).forEach(([name, url]) => {
					const li = document.createElement("li");
					li.className = "saved-link-item";
					const nameEl = document.createElement("span");
					nameEl.textContent = name;
					li.appendChild(nameEl);
					const goButton = document.createElement("button");
					goButton.className = "modal-button primary go-button";
					goButton.textContent = "Go";
					goButton.addEventListener("click", () => {
						if (typeof url === "string") {
							window.open(url, "_blank");
							void chrome.runtime.sendMessage({
								action: "openTabAndRunScript",
								url: url,
							});
						} else {
							console.trace("Invalid url type:" + String(typeof url));
						}
					});
					li.appendChild(goButton);
					const deleteButton = document.createElement("button");
					deleteButton.className = "modal-button danger delete-button";
					deleteButton.textContent = "Delete";
					deleteButton.addEventListener("click", () => {
						chrome.storage.local.get("savedLinks", (result) => {
							const savedLinks = result.savedLinks || {};
							delete savedLinks[name];
							chrome.storage.local.set({savedLinks}, () => {
								li.remove();
							});
						});
					});
					li.appendChild(deleteButton);
					listEl.appendChild(li);
				});
			}
		}
		sendResponse({success: true});
	}
	if (message.action === "showRunningModal") {
		sendResponse({success: true});
	} else if (message.action === "hideRunningModal") {
		const modalWrapper = document.getElementById("scriptRunningOverlay");
		if (modalWrapper) {
			modalWrapper.style.display = "none";
			sendResponse({success: true});
		} else {
			sendResponse({
				success: false,
				message: "scriptRunningOverlay not found",
			});
		}
	}
});

window.addEventListener("error", function (event) {
	if (
		event.error &&
		event.error.message &&
		event.error.message.includes("Extension context invalidated")
	) {
		try {
			const modalWrapper = document.getElementById("scriptRunningOverlay");
			if (modalWrapper) {
				modalWrapper.style.display = "none";
			}
		} catch (error) {
			
		}
	}
});

function isExtensionContextValid() {
	try {
		return !!chrome?.runtime?.id;
	} catch (error) {
		return false;
	}
}

function startExtensionContextMonitoring() {
	let contextLossCount = 0;
	
	extensionContextCheckInterval = setInterval(async () => {
		try {
			if (!isExtensionContextValid()) {
				contextLossCount++;
				if (contextLossCount >= 3) {
					void stopScript();
					clearInterval(extensionContextCheckInterval);
				}
			} else {
				contextLossCount = 0;
				await updateScriptActivity();
			}
		} catch (error) {
			console.error("Error during extension context monitoring", error);
		}
	}, 10000);
	
	startSaveModalMonitoring();
}

function stopExtensionContextMonitoring() {
	
	if (extensionContextCheckInterval) {
		clearInterval(extensionContextCheckInterval);
		extensionContextCheckInterval = null;
	}
	
	stopSaveModalMonitoring();
}

function startSaveModalMonitoring() {
	saveModalCheckInterval = setInterval(async () => {
		if (isSaveModalBeingHandled) {
			return;
		}
		
		const saveModal = document.querySelector(
			'[data-test-modal=""][role="alertdialog"]'
		);
		if (saveModal) {
			const titleElement = saveModal.querySelector(
				"h2[data-test-dialog-title]"
			);
			if (
				titleElement &&
				titleElement.textContent.includes("Save this application?")
			) {
				await handleSaveApplicationModal();
			}
		}
	}, 5000);
}

function stopSaveModalMonitoring() {
	if (saveModalCheckInterval) {
		clearInterval(saveModalCheckInterval);
		saveModalCheckInterval = null;
	}
}

window.addEventListener("load", function () {
	if (!isExtensionContextValidQuiet()) {
		return;
	}
	
	try {
		chrome.storage.local.get(
			["shouldRestartScript", "loopRestartUrl"],
			({shouldRestartScript, loopRestartUrl}) => {
				try {
					if (!isExtensionContextValidQuiet()) {
						return;
					}
					
					if (shouldRestartScript && loopRestartUrl) {
						const currentUrl = new URL(window.location.href);
						const savedUrl = new URL(loopRestartUrl);
						const isJobSearchPage =
							currentUrl.pathname.includes("/jobs/search/");
						const hasKeywords =
							currentUrl.searchParams.has("keywords") ||
							savedUrl.searchParams.has("keywords");
						const isStartPage =
							currentUrl.searchParams.get("start") === "1" ||
							!currentUrl.searchParams.has("start");
						
						if (isJobSearchPage && hasKeywords && isStartPage) {
							if (isExtensionContextValidQuiet()) {
								chrome.storage.local.remove([
									"loopRestartUrl",
									"shouldRestartScript",
								]);
							}
							setTimeout(() => {
								void runScript();
							}, 3000);
						} else if (currentUrl.href.includes("JOBS_HOME")) {
							setTimeout(() => {
								window.location.href = loopRestartUrl;
							}, 2000);
						} else {
							if (isExtensionContextValidQuiet()) {
								void chrome.storage.local.remove([
									"loopRestartUrl",
									"shouldRestartScript",
								]);
							}
							setAutoApplyRunningSilent(false);
						}
					} else {
						setAutoApplyRunningSilent(false);
						void chrome.storage.local.remove(["lastScriptActivity"]);
					}
				} catch (error) {
					if (isExtensionContextValidQuiet()) {
						console.trace("Error in autoApplyRunning listener", error);
					}
				}
			}
		);
	} catch (error) {
		console.trace("Error in autoApplyRunning listener", error);
	}
});

try {
	window.addEventListener("beforeunload", function () {
		try {
			chrome.storage.local.get("autoApplyRunning", (result) => {
				if (result?.autoApplyRunning) {
					void chrome.storage.local.set({
						shouldRestartScript: true,
						loopRestartUrl: window.location.href,
					});
				}
			});
			
			stopExtensionContextMonitoring();
		} catch (error) {
			console.error("Error in beforeunload handler", error);
		}
	});
} catch (error) {
}
