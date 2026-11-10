import fs from 'node:fs';
import path from 'node:path';
import { refreshView, within } from './storage.js';

export function initPlan(targetDir, options = {}) {
  const planDir = path.resolve(targetDir);
  const workspace = fs.realpathSync(path.resolve(options.workspace || path.dirname(planDir)));
  if (planDir === workspace || !planDir.startsWith(workspace + path.sep)) throw new Error('Plan must be a subdirectory of its workspace.');
  within(workspace, path.relative(workspace, planDir));
  if (fs.existsSync(planDir) && fs.readdirSync(planDir).length) throw new Error('Target directory is not empty: ' + planDir);
  const mode = options.mode || 'standard', budget = options.contextBudget ?? 32000;
  if (!['light', 'standard'].includes(mode)) throw new Error('Mode must be light or standard.');
  if (!Number.isInteger(budget) || budget < 1) throw new Error('Context budget must be a positive integer.');
  const name = options.name || path.basename(workspace);
  for (const relative of ['', 'phases', 'state', 'state/runs', 'state/handoffs', 'state/gate-evidence', 'state/drafts', 'templates']) {
    fs.mkdirSync(path.join(planDir, relative), { recursive: true });
  }
  const write = (relative, content) => fs.writeFileSync(path.join(planDir, relative), content, 'utf8');
  const phases = [
    { id: 'P00', name: 'Baseline and acceptance', objective: 'Record current behavior, reproducible project checks, and measurable feature acceptance.' },
    ...(mode === 'standard' ? [{ id: 'P01', name: 'First feature slice', objective: 'Deliver one end-to-end user capability with its acceptance checks.' }] : [])
  ].map((p, index) => ({
    ...p, file: 'phases/' + p.id.toLowerCase() + '.md', depends_on: index ? ['P00'] : [],
    read: [], watch: [], gates: [], context_budget_tokens: budget,
    steps: ['Inspect the relevant code and replace the scaffold check with actual project verification.'],
    done: [{ id: 'A1', description: 'Replace this criterion with observable project behavior and its check.', checks: ['project-check'] }],
    verify: [{ id: 'project-check', command: 'node',
      args: ['-e', "console.error('Configure real project verification in phase-manifest.json before completion.'); process.exit(1)"],
      timeout_ms: 120000 }]
  }));
  const manifest = { schema_version: 2, name, mode, workspace: path.relative(planDir, workspace).replaceAll(path.sep, '/'),
    policies: ['CODING_STANDARDS.md', 'VERIFICATION.md'], gates: [], phases };
  const state = { schema_version: 2, revision: 0, updated_at: new Date().toISOString(),
    phases: phases.map(p => ({ id: p.id, status: 'planned' })), gates: [], events: [] };
  write('state/STATUS.json', JSON.stringify(state, null, 2) + '\n');
  write('README.md', '# ' + name + ' Implementation Plan\n\n' +
    'This scaffold is unverified. Configure criteria, discovery roots, and real verification commands before execution.\n\n' +
    '- [Phase definitions](phase-manifest.json)\n- [Current state](state/CURRENT_STATE.md)\n' +
    '- [Engineering standards](CODING_STANDARDS.md)\n- [Verification policy](VERIFICATION.md)\n\n' +
    'Use phasegate validate, status, and next with this directory. Use CLI transitions instead of manually declaring completion.\n');
  write('CODING_STANDARDS.md', '# Engineering standards\n\n' +
    '- Reuse existing code and keep changes cohesive with the phase outcome.\n' +
    '- Prefer an end-to-end slice when it exposes integration risks earlier.\n' +
    '- Discovery roots are starting points. Follow relevant dependencies and record material scope changes before verification.\n' +
    '- Add security, performance, accessibility, reliability, and rollback criteria where warranted.\n' +
    '- Test doubles belong in appropriate tests; production acceptance needs suitable integration or release evidence.\n');
  write('VERIFICATION.md', '# Verification policy\n\n' +
    'Each criterion maps to check IDs or a named review gate. Replace scaffold checks with meaningful project commands.\n\n' +
    'The CLI runs command/args directly in the workspace, captures exit codes and logs, and checks input stability.\n' +
    'Review commands before running verify; it executes repository-defined programs with your permissions.\n\n' +
    'Completion requires a passing record for the current workspace, resolved gates, and a reviewed handoff.\n' +
    'Completed records are historical. Declare watch paths for contracts whose changes must invalidate completion.\n' +
    'Record relevant environment and service versions in the handoff; code fingerprints do not capture all runtime inputs.\n');
  write('CONTEXT_PROTOCOL.md', '# Context and scope\n\n' +
    'The configured task budget is a planning target, not a measured or enforced token limit. Adapt it to the model, cost, and task.\n' +
    'Start with the card, policies, prerequisite handoffs, and discovery roots. Follow relevant references as needed.\n' +
    'Checkpoint discoveries. Split when an outcome stops being cohesive or cannot be verified within the available session.\n');
  write('state/DECISIONS.md', '# Decisions\n\nRecord consequential choices, alternatives, and reasons here.\n');
  write('templates/HANDOFF.md', '# Phase handoff\n\n<!-- phasegate:draft -->\n\n' +
    'Replace these prompts with evidence, review the result, then remove the draft marker.\n\n' +
    '## Outcome and acceptance\n\n## Changed paths and decisions\n\n## Verification run and environment\n\n' +
    '## Diff review, residual risks, and rollback\n\n## Next context\n');
  write('templates/PHASE_SPLIT.md', '# Splitting a phase\n\n' +
    'Create child cards and a JSON array of complete child definitions. Omit depends_on; split assigns a chain, inherits prerequisite gates, and rewires downstream dependencies.\n' +
    'Retain relevant parent acceptance criteria in the children. Explain scope and partially implemented work in the split reason.\n');
  for (const p of phases) write(p.file, '# ' + p.id + ' — ' + p.name + '\n\n' + p.objective +
    '\n\nAcceptance, commands, and dependencies are in phase-manifest.json. Run phasegate status for execution state.\n');
  if (mode === 'standard') {
    write('RELEASE_GATES.md', '# Release readiness\n\n' +
      'Define applicable gates with accountable owners. Consider deployment, rollback, observability, migration, and external approvals.\n');
    write('state/INFRASTRUCTURE_STATUS.md', '# Infrastructure\n\nRecord environment identifiers and prerequisites. Store secret references, never credential values.\n');
    manifest.policies.push('RELEASE_GATES.md');
  }
  write('phase-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  refreshView(planDir, state);
  return { planDir, projectName: name, mode, message: 'Unverified plan initialized. Configure real acceptance checks; P00 is the first ready phase.' };
}
