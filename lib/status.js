import { inspectPlan } from './state.js';

export function getStatus(planDir) {
  const data = inspectPlan(planDir), rows = data.rows;
  const active = rows.find(r => r.recordedStatus === 'in_progress');
  return {
    name: data.manifest.name, revision: data.state.revision,
    nextPhase: active ? (active.status === 'in_progress' ? active.id : null) : rows.find(r => r.status === 'ready')?.id || null,
    phases: rows, total: rows.filter(r => r.status !== 'split').length, phaseCount: rows.length,
    completed: rows.filter(r => r.status === 'complete').length,
    ready: rows.filter(r => r.status === 'ready').length,
    inProgress: rows.filter(r => r.recordedStatus === 'in_progress').length,
    needsInput: rows.filter(r => r.status === 'needs_input').length,
    stale: rows.filter(r => r.status === 'stale').length,
    gates: data.state.gates
  };
}
