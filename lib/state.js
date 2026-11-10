import fs from 'node:fs';
import { loadPlan, gateIds } from './model.js';
import { digest, within } from './storage.js';
import { evidenceProblems, gateProblem, gateHash } from './evidence.js';

export function inspectState(data) {
  const rows = new Map();
  function inspect(id) {
    if (rows.has(id)) return rows.get(id);
    const p = data.manifest.phases.find(item => item.id === id);
    const s = data.state.phases.find(item => item.id === id);
    const dependencies = p.depends_on.map(inspect);
    const dependencyProblems = dependencies.filter(d => d.status !== 'complete').map(d => 'Prerequisite ' + d.id + ' is ' + d.status + '.');
    const gateProblems = p.gates.map(g => gateProblem(data, g)).filter(Boolean);
    const missingReads = p.read.filter(relative => !fs.existsSync(within(data.workspace, relative)));
    const reasons = [...dependencyProblems, ...gateProblems, ...missingReads.map(relative => 'Discovery root is missing: ' + relative)];
    let status = s.status;
    if (status === 'complete') {
      reasons.push(...evidenceProblems(data, p, s.evidence));
      reasons.push(...gateIds(p).map(g => gateProblem(data, g)).filter(Boolean));
      if (s.gate_hash !== gateHash(data, p)) reasons.push('Gate evidence changed since completion.');
      try {
        const handoff = fs.readFileSync(within(data.dir, s.handoff));
        if (!handoff.length || digest(handoff) !== s.handoff_sha256) reasons.push('Handoff is empty or changed.');
      } catch { reasons.push('Handoff is missing.'); }
      if (reasons.length) status = 'stale';
    } else if (status === 'planned') {
      status = reasons.length ? 'planned' : 'ready';
    } else if (status === 'in_progress' && reasons.length) {
      status = 'blocked';
    }
    if (s.status === 'needs_input') reasons.push(s.blocker);
    const row = { id, name: p.name, status, recordedStatus: s.status, owner: s.owner || null, reasons, phase: p };
    rows.set(id, row);
    return row;
  }
  for (const p of data.manifest.phases) inspect(p.id);
  return data.manifest.phases.map(p => rows.get(p.id));
}

export function inspectPlan(planDir) {
  const data = loadPlan(planDir);
  return { ...data, rows: inspectState(data) };
}
