function sortData(data) {
    return data.sort((a, b) => {
        const countA = a.count === undefined ? -Infinity : a.count;
        const countB = b.count === undefined ? -Infinity : b.count;
        return countB - countA;
    }).sort((a, b) => {
        const timeA = a.createdAt === undefined ? -Infinity : a.createdAt;
        const timeB = b.createdAt === undefined ? -Infinity : b.createdAt;
        return timeB - timeA;
    })
}

function isNumeric(str) {
    return /^\d+$/.test(str);
}

document.addEventListener('DOMContentLoaded', function () {
    
    fetchInputFieldConfigs(displayAndUpdateInputFieldConfig);
    fetchRadioButtonConfigs(displayRadioButtonConfigs);
    fetchDropdownConfigs(displayDropdownConfigs);
    
    chrome.storage.onChanged.addListener(changes => {
        if ('inputFieldConfigs' in changes) {
            const newConfigurations = changes.inputFieldConfigs.newValue || [];
            displayAndUpdateInputFieldConfig(newConfigurations);
        }
        if ('radioButtons' in changes) {
            const newConfigurations = changes.radioButtons.newValue || [];
            displayRadioButtonConfigs(newConfigurations);
        }
        if ('dropdowns' in changes) {
            const newConfigurations = changes.dropdowns.newValue || [];
            displayDropdownConfigs(newConfigurations);
        }
    });
});



function fetchRadioButtonConfigs(callback) {
    chrome.storage.local.get('radioButtons', result => {
        const radioButtons = result?.radioButtons || [];
        callback(radioButtons);
    });
}

function fetchDropdownConfigs(callback) {
    chrome.storage.local.get('dropdowns', result => {
        const dropdowns = result.dropdowns || [];
        callback(dropdowns);
    });
}

function fetchInputFieldConfigs(callback) {
    chrome.runtime.sendMessage({ action: 'getInputFieldConfig' }, result => {
        const inputFieldConfigs = result || [];
        callback(inputFieldConfigs);
    });
}

function displayRadioButtonConfigs(radioButtons) {
    const configurationsDiv = document.getElementById('radio');
    configurationsDiv.innerHTML = '';
    const sortedRadioButtons = sortData(radioButtons)    
    sortedRadioButtons.forEach(config => {
        const configContainer = document.createElement('div');
        configContainer.className = 'config-container';
        configContainer.id = `radio-config-${config.placeholderIncludes}-container`;
        const questionTitle = document.createElement('h3');
        questionTitle.textContent = `${config.placeholderIncludes}`;
        configContainer.appendChild(questionTitle);
        const configDetails = document.createElement('div');
        configDetails.className = 'config-details';
        configDetails.innerHTML = `
            <div class="selected-option">
                <h3><strong>Counter:</strong> ${config.count}</h3>
            </div>
        `;
        configContainer.appendChild(configDetails);
        config.options.forEach(option => {
            const radioContainer = document.createElement('div');
            radioContainer.className = 'radio-container';
            const radioButton = document.createElement('input');
            radioButton.type = 'radio';
            radioButton.name = `config-${config.placeholderIncludes}-radio`;
            radioButton.value = option.value;
            radioButton.checked = option.selected;
            const label = document.createElement('label');
            
            
            label.textContent = isNumeric(option.value) ? option?.text : option.value;
            radioContainer.appendChild(radioButton);
            radioContainer.appendChild(label);
            configContainer.appendChild(radioContainer);
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.style.display = 'block';
        deleteButton.addEventListener('click', () => deleteRadioButtonConfig(config.placeholderIncludes));
        configContainer.appendChild(deleteButton);
        addUpdateRadioButtonGroupEventListener(config.placeholderIncludes);
        configurationsDiv.appendChild(configContainer);
    });
}


function addUpdateRadioButtonGroupEventListener(placeholder) {
    const configurationsDiv = document.getElementById('radio');
    configurationsDiv.addEventListener('change', function(event) {
        if (event.target.matches(`[name="config-${placeholder}-radio"]`)) {
            chrome.runtime.sendMessage({
                action: 'updateRadioButtonValueByPlaceholder',
                placeholderIncludes: placeholder,
                newValue: event.target.value
            });
        }
    });
}

async function deleteRadioButtonConfig(placeholder) {
    await chrome.runtime.sendMessage({ action: 'deleteRadioButtonConfig', data: placeholder });
}

function displayDropdownConfigs(dropdowns) {
    const configurationsDiv = document.getElementById('dropdown');
    configurationsDiv.innerHTML = '';
    const sortedDropdowns = sortData(dropdowns)
    sortedDropdowns.forEach(config => {
        const configContainer = document.createElement('div');
        configContainer.className = 'config-container';
        configContainer.id = `dropdown-config-${config.placeholderIncludes}-container`;
        
        const questionTitle = document.createElement('h3');
        questionTitle.textContent = `${config.placeholderIncludes}`;
        configContainer.appendChild(questionTitle);
        
        const configDetails = document.createElement('div');
        configDetails.className = 'config-details';
        
        configDetails.innerHTML += `
            <div class="dropdown-details">
                <h3><strong>Counter:</strong> ${config.count}</h3>
            </div>
        `;
        
        const selectContainer = document.createElement('div');
        selectContainer.className = 'select-container';
        const select = document.createElement('select');
        
        config.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.value;
            if (option.selected) {
                optionElement.selected = true;
            }
            select.appendChild(optionElement);
        });
        
        select.disabled = false;
        selectContainer.appendChild(select);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteDropdownConfig(config.placeholderIncludes));
        
        configDetails.appendChild(selectContainer);
        configContainer.appendChild(configDetails);
        configContainer.appendChild(document.createElement("br"));
        configContainer.appendChild(deleteButton);
        configurationsDiv.appendChild(configContainer);
        configurationsDiv.appendChild(document.createElement("br"));
        configurationsDiv.appendChild(document.createElement("br"));
        
        void addUpdateDropDownGroupEventListener(config.placeholderIncludes);
    });
}


async function addUpdateDropDownGroupEventListener(placeholderIncludes) {
    const select = document.getElementById(`dropdown-config-${placeholderIncludes}-container`).querySelector('select');
    select.addEventListener('change', async () => {
        const newValue = select.value;
        
        if (newValue !== '') {
            try {
                const { dropdowns } = await chrome.storage.local.get('dropdowns');
                const currentDropdownConfig = dropdowns.find(config => config.placeholderIncludes === placeholderIncludes);
                const toSendData = {
                    action: 'updateDropdownConfig',
                    data: {
                        placeholderIncludes: placeholderIncludes,
                        options:currentDropdownConfig.options,
                        value: newValue,
                    }
                }
                
                await chrome.runtime.sendMessage(toSendData);
            } catch (error) {
                console.error('Error updating dropdown:', error)
            }
        }
    });
}

function deleteDropdownConfig(placeholderIncludes) {
    chrome.runtime.sendMessage({ action: 'deleteDropdownConfig', data: placeholderIncludes });
    const configContainer = document.getElementById(`dropdown-config-${placeholderIncludes}-container`);
    if (configContainer) {
        configContainer.remove();
    }
}

function updateConfigFormControl(placeholder) {
    const inputField = document.getElementById(`config-${placeholder}`);
    const newValue = inputField.value.trim();
    chrome.runtime.sendMessage({ action: 'updateInputFieldValue', data: { placeholder, value: newValue } });
}

function displayAndUpdateInputFieldConfig(configurations) {
    const configurationsDiv = document.getElementById('configurations');
    configurationsDiv.innerHTML = '';
    if (configurations && configurations.length > 0) {
        const sortedConfigurations = sortData(configurations)
        sortedConfigurations.forEach(config => {
            const configContainer = document.createElement('div');
            configContainer.id = `config-${config.placeholderIncludes}-container`;
            configContainer.className = 'config-container';
            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.className = 'buttons-wrapper';
            const inputField = document.createElement('input');
            const updateButton = document.createElement('button');
            updateButton.className = 'update-button';
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            configContainer.innerHTML = `
    <div class="config-container">
        <h3>${config.placeholderIncludes}</h3>
        <div class="config-details">
            <h3 id="currentVlaue"><strong>Current Value: </strong>${config.defaultValue}</h3>
            <h3><strong>Counter:</strong> ${config.count}</h3>
        </div>
    </div>
`;
            inputField.type = 'text';
            inputField.id = `config-${config.placeholderIncludes}`;
            inputField.placeholder = 'New Default Value';
            inputField.className = 'config-input';
            inputField.value = config.defaultValue;
            updateButton.textContent = 'Update';
            updateButton.addEventListener('click', () => updateConfigFormControl(config.placeholderIncludes));
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => deleteConfig(config.placeholderIncludes));
            configContainer.appendChild(inputField);
            configContainer.appendChild(buttonsWrapper);
            buttonsWrapper.appendChild(updateButton);
            buttonsWrapper.appendChild(deleteButton);
            configurationsDiv.appendChild(configContainer);
        });
    }
}

function deleteConfig(placeholder) {
    chrome.runtime.sendMessage({ action: 'deleteInputFieldConfig', data: placeholder });
    const configContainer = document.getElementById(`config-${placeholder}-container`);
    if (configContainer) {
        configContainer.remove();
    }
}

const defaultNullFieldInput = {
    YearsOfExperience: '',
    FirstName: '',
    LastName: '',
    PhoneNumber: '',
    City: '',
    Email: ''
}

function loadDefaultFields() {
    chrome.storage.local.get('defaultFields', function(result) {
        const defaultFields = result.defaultFields || {}
        if (Object.keys(defaultFields).length === 0 && defaultFields.constructor === Object) {
            chrome.storage.local.set({ 'defaultFields': defaultNullFieldInput }, function() {
                
                renderInputFields(defaultNullFieldInput)
                updateStatusMessage()
            })
        } else {
            renderInputFields(defaultFields)
            updateStatusMessage()
        }
    })
}

function updateStatusMessage() {
    const inputFields = document.getElementById('default-input-fields').querySelectorAll('input')
    let allFieldsFilled = true
    
    for (const inputField of inputFields) {
        if (!inputField.value.trim()) {
            allFieldsFilled = false
            break
        }
    }
    
    const messageElement = document.getElementById('status-message')
    if (allFieldsFilled) {
        messageElement.textContent = 'You are ready to use auto apply!'
        messageElement.style.color = '#007700'
    } else {
        messageElement.textContent = 'Please fill out the missing values:'
        messageElement.style.color = '#b50000'
    }
}

function createInputField(fieldName, fieldValue) {
    const fieldContainer = document.createElement('div')
    const inputLabel = document.createElement('label')
    const inputField = document.createElement('input')
    inputLabel.textContent = getInputLabelText(fieldName)
    inputField.setAttribute('name', fieldName)
    inputField.value = fieldValue || ''
    
    if (!inputField.value) {
        inputField.classList.add('input-error')
    }
    
    fieldContainer.classList.add('field-container')
    fieldContainer.appendChild(inputLabel)
    fieldContainer.appendChild(inputField)
    return fieldContainer
}

function getInputLabelText(fieldName) {
    switch (fieldName) {
        case 'YearsOfExperience':
            return 'Years of Experience'
        case 'FirstName':
            return 'First Name'
        case 'LastName':
            return 'Last Name'
        case 'PhoneNumber':
            return 'Phone Number'
        case 'City':
            return 'City'
        case 'Email':
            return 'Email'
        default:
            return fieldName
    }
}

function renderInputFields(defaultFields) {
    const inputFieldsContainer = document.getElementById('default-input-fields')
    inputFieldsContainer.innerHTML = ''
    for (const fieldName in defaultFields) {
        const fieldContainer = createInputField(fieldName, defaultFields[fieldName])
        inputFieldsContainer.appendChild(fieldContainer)
    }
}

function updateConfigDefaultFields(placeholder, newValue) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'updateInputFieldValue', data: { placeholder, value: newValue } }, () => {
            resolve()
        })
    })
}

const defaultInputSection = document.getElementById('default-input-fields');

const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            const defaultInputContainers = defaultInputSection.querySelectorAll('.field-container');
            
            if (defaultInputContainers.length > 0) {
                defaultInputContainers.forEach((fieldContainer) => {
                    const inputs = fieldContainer.querySelectorAll('input');
                    inputs.forEach((input) => {
                        if (!input.dataset.listenerAdded) {
                            input.addEventListener('change', async (event) => {
                                const fieldName = event.target.getAttribute('name');
                                const fieldValue = event.target.value.trim();
                                await new Promise((resolve) => {
                                    chrome.storage.local.get('defaultFields', (result) => {
                                        const defaultFields = result.defaultFields || {};
                                        defaultFields[fieldName] = fieldValue;
                                        chrome.storage.local.set({ 'defaultFields': defaultFields }, () => {
                                            resolve();
                                        });
                                    });
                                });
                                
                                if (fieldName === 'FirstName') {
                                    await updateConfigDefaultFields('First name', fieldValue);
                                }
                                if (fieldName === 'LastName') {
                                    await updateConfigDefaultFields('Last name', fieldValue);
                                }
                                if (fieldName === 'PhoneNumber') {
                                    await updateConfigDefaultFields('Mobile phone number', fieldValue);
                                }
                                updateStatusMessage();
                            });
                            
                            input.dataset.listenerAdded = 'true';
                        }
                    });
                });
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', function () {
    loadDefaultFields();
    if (defaultInputSection) {
        observer.observe(defaultInputSection, { childList: true, subtree: true });
    }
});

window.addEventListener('beforeunload', function () {
    observer.disconnect();
});
