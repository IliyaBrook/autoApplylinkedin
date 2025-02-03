const defaultNullFieldInput =  { 
    YearsOfExperience: "",
    FirstName: "",
    LastName: "",
    PhoneNumber: "",
    City: "",
    Email:""
}


function loadDefaultFields() {
    chrome.storage.local.get('defaultFields', function(result) {
      const defaultFields = result.defaultFields || {};
      if (Object.keys(defaultFields).length === 0 && defaultFields.constructor === Object) {
        chrome.storage.local.set({ 'defaultFields': defaultNullFieldInput }, function() {

          renderInputFields(defaultNullFieldInput);
          updateStatusMessage(); 
        });
      } else {
        renderInputFields(defaultFields);
        updateStatusMessage(); 
      }
    });

  }

function updateStatusMessage() {
  const inputFields = document.getElementById('input-fields').querySelectorAll('input')
  let allFieldsFilled = true
  
  for (const inputField of inputFields) {
    if (!inputField.value.trim()) {
      allFieldsFilled = false;
      break;
    }
  }
  
  const messageElement = document.getElementById('status-message')
  if (allFieldsFilled) {
    messageElement.textContent = 'You are ready to use auto apply!'
    messageElement.style.color = '#007700'
  } else {
    messageElement.textContent = 'To use Auto Apply, fill out the missing values:'
    messageElement.style.color = '#b50000'
  }
}

function createInputField(fieldName, fieldValue) {
  const fieldContainer = document.createElement('div');
  const inputLabel = document.createElement('label');
  const inputField = document.createElement('input');

  inputLabel.textContent = getInputLabelText(fieldName);
  inputField.setAttribute('name', fieldName);
  inputField.value = fieldValue || '';

  if (!inputField.value) {
    inputField.classList.add('input-error');
  }

  fieldContainer.classList.add('field-container');
  fieldContainer.appendChild(inputLabel);
  fieldContainer.appendChild(inputField);
  return fieldContainer;
}

function getInputLabelText(fieldName) {
  switch (fieldName) {
    case 'YearsOfExperience':
      return 'Years of Experience';
    case 'FirstName':
      return 'First Name';
    case 'LastName':
      return 'Last Name';
    case 'PhoneNumber':
      return 'Phone Number';
    case 'City':
      return 'City';     
    case 'Email':
      return 'Email';
    default:
      return fieldName;
  }
}

function renderInputFields(defaultFields) {
  const inputFieldsContainer = document.getElementById('input-fields');
  inputFieldsContainer.innerHTML = ''; 
  for (const fieldName in defaultFields) {
    const fieldContainer = createInputField(fieldName, defaultFields[fieldName]);
    inputFieldsContainer.appendChild(fieldContainer);
  }
}

function updateConfigDI(placeholder, newValue) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'updateInputFieldValue', data: { placeholder, value: newValue } }, () => {
      resolve();
    });
  });
}

async function handleSaveButtonClick() {
  const fields = {};

  const inputFields = document.getElementById('input-fields').querySelectorAll('input');
  inputFields.forEach(function(inputField) {
    const fieldName = inputField.getAttribute('name');
    fields[fieldName] = inputField.value.trim();
  });

  await new Promise((resolve) => {
    chrome.storage.local.set({ 'defaultFields': fields }, function() {

      resolve();
    });
  });

  await updateConfigDI("First name", fields.FirstName);
  
  await updateConfigDI("Last name", fields.LastName);
  
  await updateConfigDI("Mobile phone number", fields.PhoneNumber);

  loadDefaultFields();
}

document.addEventListener('DOMContentLoaded', function() {
  loadDefaultFields();
  const saveButton = document.getElementById('save-button');
  saveButton.addEventListener('click', handleSaveButtonClick);
});
