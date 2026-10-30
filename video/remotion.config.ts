import {Config} from '@remotion/cli/config';
import {existsSync} from 'node:fs';
// Prefer installed Chrome on this Mac: the downloaded headless shell stalled at root loading.
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (existsSync(localChrome)) Config.setBrowserExecutable(localChrome);
Config.setConcurrency(2);
