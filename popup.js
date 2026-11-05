const DEFAULTS = {
    hideFollow: true,
    hideJoin: true,
    hideAds: true,
    showCopyHtml: false,
    debugLog: false
};

const inputs = Object.keys(DEFAULTS).map(key => document.getElementById(key));

chrome.storage.local.get(DEFAULTS, settings => {
    inputs.forEach(input => {
        input.checked = settings[input.id];
    });
});

inputs.forEach(input => {
    input.addEventListener('change', () => {
        chrome.storage.local.set({ [input.id]: input.checked });
    });
});
