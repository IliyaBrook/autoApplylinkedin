document.addEventListener('DOMContentLoaded', () => {
    // Bad Words selectors
    const badWordsToggle = document.getElementById('bad-words-toggle');
    const badWordsContainer = document.getElementById('bad-words-list');
    const newBadWordInput = document.getElementById('new-bad-word');
    const addBadWordButton = document.getElementById('add-bad-word-button');
    
    // Job Title Must Contain (Good Words) selectors
    const titleFilterToggle = document.getElementById('title-filter-toggle');
    const titleFilterContainer = document.getElementById('title-filter-list');
    const newTitleFilterInput = document.getElementById('new-title-filter');
    const addTitleFilterButton = document.getElementById('add-title-filter-button');
    
    // Job Title Must Skip selectors
    const titleSkipToggle = document.getElementById('title-skip-toggle');
    const titleSkipContainer = document.getElementById('title-skip-list');
    const newTitleSkipInput = document.getElementById('new-title-skip');
    const addTitleSkipButton = document.getElementById('add-title-skip-button');
    
    const isDuplicate = (word, words) => {
        if (words.some(w => w.toLowerCase() === word.toLowerCase())){
            alert("Oops! This word is already in your filter. Try adding a new one!");
            return true;
        }
        return false;
    }
    
    // Initialize toggle states
    function initializeToggles() {
        chrome.storage.local.get(['badWordsEnabled', 'titleFilterEnabled', 'titleSkipEnabled'], (result) => {
            badWordsToggle.checked = result.badWordsEnabled ?? true;
            titleFilterToggle.checked = result.titleFilterEnabled ?? true;
            titleSkipToggle.checked = result.titleSkipEnabled ?? true;
        });
    }
    
    // Save toggle states
    badWordsToggle.addEventListener('change', () => {
        chrome.storage.local.set({ badWordsEnabled: badWordsToggle.checked });
    });
    
    titleFilterToggle.addEventListener('change', () => {
        chrome.storage.local.set({ titleFilterEnabled: titleFilterToggle.checked });
    });
    
    titleSkipToggle.addEventListener('change', () => {
        chrome.storage.local.set({ titleSkipEnabled: titleSkipToggle.checked });
    });
    
    // Load "Bad Words"
    function loadBadWords() {
        chrome.storage.local.get('badWords', (result) => {
            const badWords = result.badWords || [];
            badWordsContainer.innerHTML = '';
            badWords.forEach((word, index) => addWordItem(word, index, badWordsContainer, 'badWords'));
        });
    }
    
    // Load "Job Title Must Contain" (Good Words)
    function loadTitleFilter() {
        chrome.storage.local.get('titleFilterWords', (result) => {
            const titleFilterWords = result.titleFilterWords || [];
            titleFilterContainer.innerHTML = '';
            titleFilterWords.forEach((word, index) => addWordItem(word, index, titleFilterContainer, 'titleFilterWords'));
        });
    }
    
    // Load "Job Title Must Skip" words
    function loadTitleSkip() {
        chrome.storage.local.get('titleSkipWords', (result) => {
            const titleSkipWords = result.titleSkipWords || [];
            titleSkipContainer.innerHTML = '';
            titleSkipWords.forEach((word, index) => addWordItem(word, index, titleSkipContainer, 'titleSkipWords'));
        });
    }
    
    // Add a word to the UI
    function addWordItem(word, index, container, filterType) {
        
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';
        
        const wordInput = document.createElement('input');
        wordInput.type = 'text';
        wordInput.value = word;
        wordInput.dataset.index = index;
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteWord(index, filterType));
        
        wordInput.addEventListener('change', () => updateWord(index, wordInput.value, filterType));
        
        wordItem.appendChild(wordInput);
        wordItem.appendChild(deleteButton);
        container.appendChild(wordItem);
    }
    
    // Add new "Bad Word"
    addBadWordButton.addEventListener('click', () => {
        const newWord = newBadWordInput.value.trim();
        if (newWord) {
            chrome.storage.local.get('badWords', (result) => {
                if (!isDuplicate(newWord, result.badWords)) {
                    const updatedWords = [...(result.badWords || []), newWord];
                    chrome.storage.local.set({ badWords: updatedWords }, loadBadWords);
                }
                newBadWordInput.value = '';
            });
        }
    });
    
    // Add new "Job Title Must Contain" word
    addTitleFilterButton.addEventListener('click', () => {
        const newWord = newTitleFilterInput.value.trim();
        if (newWord) {
            chrome.storage.local.get('titleFilterWords', (result) => {
                if (!isDuplicate(newWord, result.titleFilterWords)) {
                    const updatedWords = [...(result.titleFilterWords || []), newWord];
                    chrome.storage.local.set({ titleFilterWords: updatedWords }, loadTitleFilter);
                }
                newTitleFilterInput.value = '';
            });
        }
    });
    
    // Add new "Job Title Must Skip" word
    addTitleSkipButton.addEventListener('click', () => {
        const newWord = newTitleSkipInput.value.trim();
        if (newWord) {
            chrome.storage.local.get('titleSkipWords', (result) => {
                if (!isDuplicate(newWord, result.titleSkipWords)) {
                    const updatedWords = [...(result.titleSkipWords || []), newWord];
                    chrome.storage.local.set({ titleSkipWords: updatedWords }, loadTitleSkip);
                }
                newTitleSkipInput.value = '';
            });
        }
    });
    
    // Delete a word
    function deleteWord(index, filterType) {
        const key = {
            badWords: 'badWords',
            titleFilterWords: 'titleFilterWords',
            titleSkipWords: 'titleSkipWords'
        }[filterType];
        
        chrome.storage.local.get(key, (result) => {
            const updatedWords = (result[key] || []).filter((_, i) => i !== index);
            chrome.storage.local.set({ [key]: updatedWords }, () => {
                if (filterType === 'badWords') loadBadWords();
                else if (filterType === 'titleFilterWords') loadTitleFilter();
                else if (filterType === 'titleSkipWords') loadTitleSkip();
            });
        });
    }
    
    // Update a word
    function updateWord(index, newWord, filterType) {
        const key = {
            badWords: 'badWords',
            titleFilterWords: 'titleFilterWords',
            titleSkipWords: 'titleSkipWords'
        }[filterType];
        
        chrome.storage.local.get(key, (result) => {
            const updatedWords = [...(result[key] || [])];
            updatedWords[index] = newWord;
            chrome.storage.local.set({ [key]: updatedWords });
        });
    }
    
    // Initialize
    initializeToggles();
    loadBadWords();
    loadTitleFilter();
    loadTitleSkip();
});
