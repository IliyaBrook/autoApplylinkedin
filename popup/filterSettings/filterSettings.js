document.addEventListener('DOMContentLoaded', () => {
    const badWordsToggle = document.getElementById('bad-words-toggle');
    const badWordsContainer = document.getElementById('bad-words-list');
    const newBadWordInput = document.getElementById('new-bad-word');
    const addBadWordButton = document.getElementById('add-bad-word-button');
    
    const titleFilterToggle = document.getElementById('title-filter-toggle');
    const titleFilterContainer = document.getElementById('title-filter-list');
    const newTitleFilterInput = document.getElementById('new-title-filter');
    const addTitleFilterButton = document.getElementById('add-title-filter-button');
    
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
    
    function initializeToggles() {
        chrome.storage.local.get(['badWordsEnabled', 'titleFilterEnabled', 'titleSkipEnabled'], (result) => {
            badWordsToggle.checked = result.badWordsEnabled ?? true;
            titleFilterToggle.checked = result.titleFilterEnabled ?? true;
            titleSkipToggle.checked = result.titleSkipEnabled ?? true;
        });
    }
    
    badWordsToggle.addEventListener('change', () => {
        chrome.storage.local.set({ badWordsEnabled: badWordsToggle.checked });
    });
    
    titleFilterToggle.addEventListener('change', () => {
        chrome.storage.local.set({ titleFilterEnabled: titleFilterToggle.checked });
    });
    
    titleSkipToggle.addEventListener('change', () => {
        chrome.storage.local.set({ titleSkipEnabled: titleSkipToggle.checked });
    });
    
    
    function loadBadWords() {
        chrome.storage.local.get('badWords', (result) => {
            const badWords = result?.badWords || [];
            badWordsContainer.innerHTML = '';
            badWords.forEach((word, index) => addWordItem(word, index, badWordsContainer, 'badWords'));
        });
    }
    
    
    function loadTitleFilter() {
        chrome.storage.local.get('titleFilterWords', (result) => {
            const titleFilterWords = result?.titleFilterWords || [];
            titleFilterContainer.innerHTML = '';
            titleFilterWords.forEach((word, index) => addWordItem(word, index, titleFilterContainer, 'titleFilterWords'));
        });
    }
    
    
    function loadTitleSkip() {
        chrome.storage.local.get('titleSkipWords', (result) => {
            const titleSkipWords = result?.titleSkipWords || [];
            titleSkipContainer.innerHTML = '';
            titleSkipWords.forEach((word, index) => addWordItem(word, index, titleSkipContainer, 'titleSkipWords'));
        });
    }
    
    
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
    
    
    initializeToggles();
    loadBadWords();
    loadTitleFilter();
    loadTitleSkip();
});
