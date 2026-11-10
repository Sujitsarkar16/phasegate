import { inspectPlan } from './state.js';

export function getNextPrompt(planDir) {
  const data = inspectPlan(planDir);
  const active = data.rows.find(r => r.recordedStatus === 'in_progress');
  const next = active || data.rows.find(r => r.status === 'ready');
  if (!next || next.status === 'blocked') {
    const finished = data.rows.every(r => ['complete', 'split'].includes(r.status));
    return { nextId: null, message: finished ? 'All current phases are complete.' :
      'No executable phase. Inspect status for stale evidence, blockers, or an active claim that needs release.' };
  }
  const p = next.phase;
  return { nextId: p.id, phase: p, prompt: [
    'Execute phase ' + p.id + ' in ' + data.dir + '.',
    'Read ' + p.file + ', phase-manifest.json, state/STATUS.json, relevant policies, and prerequisite handoffs.',
    next.owner ? 'This phase is claimed by ' + next.owner + '; resume with that owner or arrange a release.' :
      'Claim this phase with phasegate start ' + p.id + ' <plan> --owner <session-owner>.',
    'Discovery starting points: ' + (p.read.join(', ') || 'inspect relevant repository configuration and feature code.'),
    'Follow relevant dependencies; checkpoint material discoveries and update the phase if scope changes.',
    'Planning budget: ' + p.context_budget_tokens + ' tokens (a configurable estimate).',
    'Satisfy acceptance criteria: ' + p.done.map(d => d.id + ': ' + d.description).join('; '),
    'Review the declared command/args, then run phasegate verify ' + p.id + ' <plan> --owner <session-owner>.',
    'Review the diff and draft handoff. Complete through the CLI with a reviewer and resolved gates.',
    'Record checkpoints and external blockers instead of claiming unfinished work is complete.'
  ].join('\n') };
}
