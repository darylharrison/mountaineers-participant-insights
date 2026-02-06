// This script runs in the isolated world of the content script.
// We need to inject the core logic into the main world to access page variables.

const inject = () => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('extension-inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
        script.remove();
    };
};

if (document.readyState === 'complete') {
    inject();
} else {
    window.addEventListener('load', inject);
}
