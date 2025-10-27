let currentEditingCv = null;
let currentEditingFilter = null;
let currentActiveCv = null;

document.addEventListener('DOMContentLoaded', () => {
    loadCvFiles();
    initializeEventListeners();
});

function initializeEventListeners() {
    document.getElementById('addCvBtn').addEventListener('click', () => {
        openModal('addCvModal');
    });

    document.getElementById('saveCvBtn').addEventListener('click', saveCvFile);
    document.getElementById('cancelCvBtn').addEventListener('click', () => {
        closeModal('addCvModal');
    });

    document.getElementById('saveEditCvBtn').addEventListener('click', saveEditedCvFile);
    document.getElementById('cancelEditCvBtn').addEventListener('click', () => {
        closeModal('editCvModal');
    });

    document.getElementById('addFilterBtn').addEventListener('click', () => {
        if (currentActiveCv) {
            openModal('addFilterModal');
        }
    });

    document.getElementById('saveFilterBtn').addEventListener('click', saveFilter);
    document.getElementById('cancelFilterBtn').addEventListener('click', () => {
        closeModal('addFilterModal');
    });

    document.getElementById('saveEditFilterBtn').addEventListener('click', saveEditedFilter);
    document.getElementById('cancelEditFilterBtn').addEventListener('click', () => {
        closeModal('editFilterModal');
    });

    document.getElementById('cvFileInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveCvFile();
    });

    document.getElementById('editCvFileInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveEditedCvFile();
    });

    document.getElementById('filterInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveFilter();
    });

    document.getElementById('editFilterInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveEditedFilter();
    });
}

function loadCvFiles() {
    chrome.storage.local.get(['cvFiles', 'selectedCvFile', 'selectedCvFileFilters'], (result) => {
        const cvFiles = result.cvFiles || [];
        const selectedCvFile = result.selectedCvFile || null;
        const filters = result.selectedCvFileFilters || {};

        renderCvFiles(cvFiles, selectedCvFile, filters);
    });
}

function renderCvFiles(cvFiles, selectedCvFile, filters) {
    const cvFilesList = document.getElementById('cvFilesList');
    
    if (cvFiles.length === 0) {
        cvFilesList.innerHTML = '<div class="empty-state"><p>No CV files yet</p><p>Click "Add CV File" to get started</p></div>';
        return;
    }

    cvFilesList.innerHTML = '';
    
    cvFiles.forEach((cvFileObj) => {
        const cvFileItem = document.createElement('div');
        cvFileItem.className = 'cv-file-item';
        
        if (cvFileObj.id === selectedCvFile) {
            cvFileItem.classList.add('selected');
        }

        if (cvFileObj.id === currentActiveCv) {
            cvFileItem.classList.add('active');
        }

        const filterCount = filters[cvFileObj.id] ? filters[cvFileObj.id].length : 0;

        cvFileItem.innerHTML = `
            <div class="cv-file-content">
                <span class="cv-file-name">${cvFileObj.name}</span>
                ${filterCount > 0 ? `<span class="cv-file-badge">${filterCount} filters</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn-icon btn-manage" data-id="${cvFileObj.id}" data-name="${cvFileObj.name}">Manage</button>
                <button class="btn-icon btn-select" data-id="${cvFileObj.id}">Select</button>
                <button class="btn-icon btn-edit" data-id="${cvFileObj.id}" data-name="${cvFileObj.name}">Edit</button>
                <button class="btn-icon btn-delete" data-id="${cvFileObj.id}" data-name="${cvFileObj.name}">Delete</button>
            </div>
        `;

        cvFileItem.querySelector('.btn-manage').addEventListener('click', (e) => {
            e.stopPropagation();
            manageFilters(cvFileObj.id, cvFileObj.name);
        });

        cvFileItem.querySelector('.btn-select').addEventListener('click', (e) => {
            e.stopPropagation();
            selectCvFile(cvFileObj.id);
        });

        cvFileItem.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            editCvFile(cvFileObj.id, cvFileObj.name);
        });

        cvFileItem.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCvFile(cvFileObj.id, cvFileObj.name);
        });

        cvFilesList.appendChild(cvFileItem);
    });
}

function saveCvFile() {
    const input = document.getElementById('cvFileInput');
    const cvFileName = input.value.trim();

    if (!cvFileName) {
        alert('Please enter a CV filename');
        return;
    }

    chrome.storage.local.get(['cvFiles'], (result) => {
        const cvFiles = result.cvFiles || [];

        const exists = cvFiles.some(f => f.name === cvFileName);
        if (exists) {
            alert('This CV file already exists');
            return;
        }

        const newCvFile = {
            id: `cv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: cvFileName
        };

        cvFiles.push(newCvFile);

        chrome.storage.local.set({ cvFiles }, () => {
            input.value = '';
            closeModal('addCvModal');
            loadCvFiles();
        });
    });
}

function editCvFile(cvId, cvName) {
    currentEditingCv = cvId;
    document.getElementById('editCvFileInput').value = cvName;
    openModal('editCvModal');
}

function saveEditedCvFile() {
    const input = document.getElementById('editCvFileInput');
    const newCvFileName = input.value.trim();

    if (!newCvFileName) {
        alert('Please enter a CV filename');
        return;
    }

    chrome.storage.local.get(['cvFiles', 'selectedCvFile', 'selectedCvFileFilters'], (result) => {
        const cvFiles = result.cvFiles || [];
        const selectedCvFile = result.selectedCvFile;
        let filters = result.selectedCvFileFilters || {};

        const currentFile = cvFiles.find(f => f.id === currentEditingCv);
        if (!currentFile) return;

        const exists = cvFiles.some(f => f.id !== currentEditingCv && f.name === newCvFileName);
        if (exists) {
            alert('This CV file already exists');
            return;
        }

        currentFile.name = newCvFileName;

        const updateData = { cvFiles, selectedCvFileFilters: filters };

        chrome.storage.local.set(updateData, () => {
            if (currentActiveCv === currentEditingCv) {
                document.getElementById('selectedCvName').textContent = newCvFileName;
            }
            currentEditingCv = null;
            input.value = '';
            closeModal('editCvModal');
            loadCvFiles();
        });
    });
}

function deleteCvFile(cvId, cvName) {
    if (!confirm(`Are you sure you want to delete "${cvName}"?`)) {
        return;
    }

    chrome.storage.local.get(['cvFiles', 'selectedCvFile', 'selectedCvFileFilters'], (result) => {
        const cvFiles = result.cvFiles || [];
        const selectedCvFile = result.selectedCvFile;
        let filters = result.selectedCvFileFilters || {};

        const index = cvFiles.findIndex(f => f.id === cvId);
        if (index !== -1) {
            cvFiles.splice(index, 1);
        }

        if (filters[cvId]) {
            delete filters[cvId];
        }

        const updateData = { cvFiles, selectedCvFileFilters: filters };

        if (selectedCvFile === cvId) {
            updateData.selectedCvFile = cvFiles.length > 0 ? cvFiles[0].id : null;
        }

        chrome.storage.local.set(updateData, () => {
            if (currentActiveCv === cvId) {
                currentActiveCv = null;
                document.getElementById('filtersSection').style.display = 'none';
            }
            loadCvFiles();
        });
    });
}

function selectCvFile(cvId) {
    chrome.storage.local.set({ selectedCvFile: cvId }, () => {
        loadCvFiles();
    });
}

function manageFilters(cvId, cvName) {
    currentActiveCv = cvId;
    document.getElementById('selectedCvName').textContent = cvName;
    document.getElementById('filtersSection').style.display = 'block';
    loadFilters(cvId);
}

function loadFilters(cvId) {
    chrome.storage.local.get(['selectedCvFileFilters'], (result) => {
        const filters = result.selectedCvFileFilters || {};
        const cvFilters = filters[cvId] || [];
        renderFilters(cvFilters);
    });
}

function renderFilters(filters) {
    const filtersList = document.getElementById('filtersList');

    if (filters.length === 0) {
        filtersList.innerHTML = '<div class="empty-state"><p>No filters yet</p><p>Click "Add Filter" to add job title filters</p></div>';
        return;
    }

    filtersList.innerHTML = '';

    filters.forEach((filter, index) => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';

        filterItem.innerHTML = `
            <div class="filter-content">
                <span class="filter-name">${filter}</span>
            </div>
            <div class="item-actions">
                <button class="btn-icon btn-edit" data-index="${index}">Edit</button>
                <button class="btn-icon btn-delete" data-index="${index}">Delete</button>
            </div>
        `;

        filterItem.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            editFilter(index, filter);
        });

        filterItem.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFilter(index);
        });

        filtersList.appendChild(filterItem);
    });
}

function saveFilter() {
    const input = document.getElementById('filterInput');
    const filterValue = input.value.trim();

    if (!filterValue) {
        alert('Please enter a job title');
        return;
    }

    chrome.storage.local.get(['selectedCvFileFilters'], (result) => {
        const filters = result.selectedCvFileFilters || {};
        const cvFilters = filters[currentActiveCv] || [];

        if (cvFilters.includes(filterValue)) {
            alert('This filter already exists');
            return;
        }

        cvFilters.push(filterValue);
        filters[currentActiveCv] = cvFilters;

        chrome.storage.local.set({ selectedCvFileFilters: filters }, () => {
            input.value = '';
            closeModal('addFilterModal');
            loadFilters(currentActiveCv);
            loadCvFiles();
        });
    });
}

function editFilter(index, filterValue) {
    currentEditingFilter = index;
    document.getElementById('editFilterInput').value = filterValue;
    openModal('editFilterModal');
}

function saveEditedFilter() {
    const input = document.getElementById('editFilterInput');
    const newFilterValue = input.value.trim();

    if (!newFilterValue) {
        alert('Please enter a job title');
        return;
    }

    chrome.storage.local.get(['selectedCvFileFilters'], (result) => {
        const filters = result.selectedCvFileFilters || {};
        const cvFilters = filters[currentActiveCv] || [];

        if (newFilterValue !== cvFilters[currentEditingFilter] && cvFilters.includes(newFilterValue)) {
            alert('This filter already exists');
            return;
        }

        cvFilters[currentEditingFilter] = newFilterValue;
        filters[currentActiveCv] = cvFilters;

        chrome.storage.local.set({ selectedCvFileFilters: filters }, () => {
            currentEditingFilter = null;
            input.value = '';
            closeModal('editFilterModal');
            loadFilters(currentActiveCv);
        });
    });
}

function deleteFilter(index) {
    if (!confirm('Are you sure you want to delete this filter?')) {
        return;
    }

    chrome.storage.local.get(['selectedCvFileFilters'], (result) => {
        const filters = result.selectedCvFileFilters || {};
        const cvFilters = filters[currentActiveCv] || [];

        cvFilters.splice(index, 1);
        filters[currentActiveCv] = cvFilters;

        chrome.storage.local.set({ selectedCvFileFilters: filters }, () => {
            loadFilters(currentActiveCv);
            loadCvFiles();
        });
    });
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.getElementById(modalId).querySelector('input').value = '';
}