import { run } from './common/core';
import workerUrl from './common/worker?worker&url';

run(window, workerUrl);
