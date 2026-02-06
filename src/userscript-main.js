import { run } from './common/core';
import workerRaw from './common/worker?raw';

(() => {
    'use strict';
    const window = unsafeWindow;
    
    const start = () => {
        run(window, URL.createObjectURL(new Blob([workerRaw], { type: 'application/javascript' })));
    };

    if (window.document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }
})();
