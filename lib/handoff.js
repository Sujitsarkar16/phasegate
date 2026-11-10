import fs from 'node:fs';
import { loadPlan } from './model.js';
import { withLock, within, exclusiveWrite } from './storage.js';

export function createHandoffTemplate(planDir, phaseId) {
  return withLock(planDir, () => {
    const data = loadPlan(planDir);
    if (!data.manifest.phases.some(p => p.id === phaseId)) throw new Error('Unknown phase: ' + phaseId);
    const file = within(data.dir, 'state/drafts/' + phaseId + '.md');
    if (fs.existsSync(file)) return { created: false, path: file, message: 'Draft already exists; it was not overwritten.' };
    const template = fs.readFileSync(within(data.dir, 'templates/HANDOFF.md'), 'utf8');
    exclusiveWrite(file, template.replace('# Phase handoff', '# ' + phaseId + ' handoff'));
    return { created: true, path: file, message: 'Created an unverified draft handoff: ' + file };
  });
}
