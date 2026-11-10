import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPlan } from '../lib/init.js';

const workspace = fileURLToPath(new URL('./beginner-demo/', import.meta.url));
const planDir = path.join(workspace, 'Implementation_Plan');
initPlan(planDir, { workspace, mode: 'light', name: 'Your first verified greeting' });
const manifestPath = path.join(planDir, 'phase-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
Object.assign(manifest.phases[0], {
  name: 'Verify the greeting',
  objective: 'Confirm that named developers receive a greeting and blank names have a friendly fallback.',
  read: ['greeting.js', 'greeting.test.js'],
  watch: ['greeting.js', 'greeting.test.js'],
  steps: ['Read the greeting and its tests.', 'Run verification.', 'Review and record a handoff.'],
  done: [
    { id: 'A1', description: 'Named developers receive a greeting with surrounding whitespace removed.', checks: ['greeting-tests'] },
    { id: 'A2', description: 'Missing and blank names receive Hello, developer!', checks: ['greeting-tests'] }
  ],
  verify: [{ id: 'greeting-tests', command: process.execPath, args: ['--test', 'greeting.test.js'], timeout_ms: 120000 }]
});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Created a configured, unverified demo plan at examples/beginner-demo/Implementation_Plan.');
console.log('No phase has been completed. Follow BEGINNER_GUIDE.md to verify and review it.');
