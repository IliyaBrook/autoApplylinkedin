document.addEventListener('DOMContentLoaded', function () {

    fetchInputFieldConfigs(displayAndUpdateInputFieldConfig);
    fetchRadioButtonConfigs(displayRadioButtonConfigs);
    fetchDropdownConfigs(displayDropdownConfigs);

    chrome.storage.onChanged.addListener(function (changes, namespace) {
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
        const radioButtons = result.radioButtons || [];
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
    const sortedRadioButtons = radioButtons.sort((a, b) => b.count - a.count);

    sortedRadioButtons.forEach(config => {
        const configContainer = document.createElement('div');
        configContainer.className = 'config-container'; // Add class name for styling
        configContainer.id = `radio-config-${config.placeholderIncludes}-container`;

        const questionTitle = document.createElement('h3'); // Changed from 'strong'
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
            label.textContent = option.value;
        
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
	  await sendMessage('deleteRadioButtonConfig', placeholder);
}

function displayDropdownConfigs(dropdowns) {
    const configurationsDiv = document.getElementById('dropdown');
    configurationsDiv.innerHTML = ''; // Clear previous content

    const sortedDropdowns = dropdowns.sort((a, b) => b.count - a.count);
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

        // Create a div to wrap the select element
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

        // Enable the dropdown to allow user interaction
        select.disabled = false;
        selectContainer.appendChild(select); // Append select to select container
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteDropdownConfig(config.placeholderIncludes));

        configDetails.appendChild(selectContainer); // Append select container to config details
        configContainer.appendChild(configDetails);
        configContainer.appendChild(document.createElement("br"));

        configContainer.appendChild(deleteButton);

        configurationsDiv.appendChild(configContainer);
        configurationsDiv.appendChild(document.createElement("br"));
        configurationsDiv.appendChild(document.createElement("br"));

        addUpdateDropDownGroupEventListener(config.placeholderIncludes);
    });
}


async function addUpdateDropDownGroupEventListener(placeholderIncludes) {
    const select = document.getElementById(`dropdown-config-${placeholderIncludes}-container`).querySelector('select');
    select.addEventListener('change', async () => {
        const select = document.getElementById(`dropdown-config-${placeholderIncludes}-container`).querySelector('select');
        const newValue = select.value;

    
        if (newValue !== '') {
            try {
                await sendMessage('updateDropdownConfig', { placeholderIncludes, value: newValue });
            }catch (error) {
	              console.error('Error updating dropdown:', error);
            }
        }
    });
}

function deleteDropdownConfig(placeholderIncludes) {
    // Add logic to delete the configuration
    chrome.runtime.sendMessage({ action: 'deleteDropdownConfig', data: placeholderIncludes });


    // Remove the entire UI container immediately
    const configContainer = document.getElementById(`dropdown-config-${placeholderIncludes}-container`);
    if (configContainer) {
        configContainer.remove();
    }
}

function displayAndUpdateInputFieldConfig(configurations) {
    const configurationsDiv = document.getElementById('configurations');
    configurationsDiv.innerHTML = '';

    // Sort configurations by count in descending order
    const sortedConfigurations = configurations.sort((a, b) => b.count - a.count);

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

        updateButton.textContent = 'Update';
        updateButton.addEventListener('click', () => updateConfig(config.placeholderIncludes));

        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteConfig(config.placeholderIncludes));
        configContainer.appendChild(inputField);
        configContainer.appendChild(buttonsWrapper);
        buttonsWrapper.appendChild(updateButton);
        buttonsWrapper.appendChild(deleteButton);
        configurationsDiv.appendChild(configContainer);
    });
}

function updateConfig(placeholder) {
    const inputField = document.getElementById(`config-${placeholder}`);
    const newValue = inputField.value.trim();

    // Add logic to validate and update the configuration
        chrome.runtime.sendMessage({ action: 'updateInputFieldValue', data: { placeholder, value: newValue } });

}

function deleteConfig(placeholder) {
    // Add logic to delete the configuration
    chrome.runtime.sendMessage({ action: 'deleteInputFieldConfig', data: placeholder });

    // Remove the entire UI container immediately
    const configContainer = document.getElementById(`config-${placeholder}-container`);
    if (configContainer) {
        configContainer.remove();
    }
}