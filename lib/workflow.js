import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadPlan, schemaErrors, gateIds } from './model.js';
import { inspectState } from './state.js';
import { withLock, commit, within, exclusiveWrite, digest, timestamp } from './storage.js';
import { recordVerification, evidenceProblems, gateProblem, gateHash, snapshot } from './evidence.js';

function mutate(planDir, action, operation) {
  return withLock(planDir, () => {
    const data = loadPlan(planDir);
    const oldManifest = structuredClone(data.manifest), oldState = structuredClone(data.state);
    const result = operation(data);
    const errors = schemaErrors(data.manifest, data.state);
    if (errors.length) throw new Error(errors.join('\n'));
    commit(data.dir, oldManifest, oldState, data.manifest, data.state, { action, ...result.event });
    return result.value || { message: action + ' recorded.' };
  });
}
function phaseState(data, id) {
  const phase = data.manifest.phases.find(p => p.id === id), state = data.state.phases.find(p => p.id === id);
  if (!phase || !state) throw new Error('Unknown phase: ' + id);
  return { phase, state };
}
function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required.');
  return value.trim();
}
function owned(data, id, owner, allowBlocked = false) {
  required(owner, 'Owner');
  const pair = phaseState(data, id);
  if (pair.state.status !== 'in_progress' || pair.state.owner !== owner) throw new Error('Phase ' + id + ' must be started by owner ' + owner + '.');
  const row = inspectState(data).find(p => p.id === id);
  if (!allowBlocked && row.status !== 'in_progress') throw new Error(row.reasons.join('\n'));
  return pair;
}
function archive(data, category, extension, content) {
  if (!content.length || !content.toString('utf8').trim()) throw new Error('Evidence must not be empty.');
  const relative = 'state/' + category + '/' + crypto.randomUUID() + extension;
  exclusiveWrite(within(data.dir, relative), content);
  return { file: relative, sha256: digest(content) };
}

export function startPhase(planDir, id, owner) {
  return mutate(planDir, 'start', data => {
    required(owner, 'Owner');
    const { state } = phaseState(data, id);
    const active = data.state.phases.find(p => p.status === 'in_progress');
    if (active && (active.id !== id || active.owner !== owner)) throw new Error('Worktree is already claimed by ' + active.owner + ' for ' + active.id);
    const row = inspectState(data).find(p => p.id === id);
    if (!['ready', 'in_progress'].includes(row.status)) throw new Error(id + ' is ' + row.status + '. ' + row.reasons.join(' '));
    state.status = 'in_progress'; state.owner = owner;
    return { event: { phase: id, owner } };
  });
}
export function verifyPhase(planDir, id, owner) {
  return mutate(planDir, 'verify', data => {
    const { phase, state } = owned(data, id, owner);
    if (!phase.verify.length) throw new Error('Configure executable verification checks before running verify.');
    const result = recordVerification(data, phase);
    state.verification = result.file;
    return { event: { phase: id, owner, evidence: result.file, passed: result.record.passed },
      value: { passed: result.record.passed, evidence: result.file, checks: result.record.checks,
        message: result.record.passed ? 'Verification passed; review the handoff before completion.' :
          'Verification failed, timed out, or its inputs changed. Inspect the recorded logs.' } };
  });
}
export function completePhase(planDir, id, options = {}) {
  return mutate(planDir, 'complete', data => {
    const { phase, state } = owned(data, id, options.owner);
    required(options.reviewer, 'Reviewer');
    const errors = evidenceProblems(data, phase, state.verification, true);
    errors.push(...gateIds(phase).map(g => gateProblem(data, g)).filter(Boolean));
    if (errors.length) throw new Error(errors.join('\n'));
    required(options.handoff, 'Handoff path');
    const content = fs.readFileSync(path.resolve(options.handoff));
    if (content.toString('utf8').includes('<!-- phasegate:draft -->')) throw new Error('Fill in and review the draft handoff, then remove its draft marker.');
    const handoff = archive(data, 'handoffs', '.md', content);
    Object.assign(state, { status: 'complete', evidence: state.verification, handoff: handoff.file,
      handoff_sha256: handoff.sha256, reviewer: options.reviewer, completed_at: timestamp(), gate_hash: gateHash(data, phase) });
    delete state.owner;
    return { event: { phase: id, owner: options.owner, reviewer: options.reviewer, evidence: state.evidence, handoff: handoff.file } };
  });
}
export function checkpointPhase(planDir, id, owner, note) {
  return mutate(planDir, 'checkpoint', data => {
    const { state } = owned(data, id, owner, true);
    state.checkpoint = { note: required(note, 'Checkpoint note'), at: timestamp(), snapshot: snapshot(data) };
    return { event: { phase: id, owner, checkpoint: state.checkpoint } };
  });
}
export function blockPhase(planDir, id, owner, reason) {
  return mutate(planDir, 'block', data => {
    const { state } = owned(data, id, owner, true);
    state.status = 'needs_input'; state.blocker = required(reason, 'Blocker reason');
    delete state.owner;
    return { event: { phase: id, owner, reason } };
  });
}
export function unblockPhase(planDir, id, reason) {
  return mutate(planDir, 'unblock', data => {
    const { state } = phaseState(data, id);
    if (state.status !== 'needs_input') throw new Error('Phase is not waiting for input.');
    required(reason, 'Resolution reason');
    state.status = 'planned'; delete state.blocker; delete state.verification;
    return { event: { phase: id, reason } };
  });
}
export function reopenPhase(planDir, id, owner, reason) {
  return mutate(planDir, 'reopen', data => {
    required(owner, 'Owner'); required(reason, 'Reopen reason');
    if (phaseState(data, id).state.status === 'split') throw new Error('Reopen a replacement child, not a split parent.');
    const affected = new Set([id]);
    let changed;
    do {
      changed = false;
      for (const p of data.manifest.phases) {
        if (!affected.has(p.id) && p.depends_on.some(dep => affected.has(dep))) { affected.add(p.id); changed = true; }
      }
    } while (changed);
    const previous = data.state.phases.filter(s => affected.has(s.id));
    if (previous.some(s => s.status === 'in_progress' && s.owner !== owner)) throw new Error('An affected phase belongs to another owner; arrange a release first.');
    data.state.phases = data.state.phases.map(s => affected.has(s.id) && s.status !== 'split' ? { id: s.id, status: 'planned' } : s);
    return { event: { phase: id, owner, reason, previous }, value: { reopened: [...affected] } };
  });
}
export function releasePhase(planDir, id, owner, reason) {
  return mutate(planDir, 'release', data => {
    const { state } = owned(data, id, owner, true);
    required(reason, 'Release/handoff reason');
    state.status = 'planned'; delete state.owner; delete state.verification;
    return { event: { phase: id, owner, reason } };
  });
}
export function resolveGate(planDir, id, owner, evidenceFile) {
  return mutate(planDir, 'resolve-gate', data => {
    const gate = data.manifest.gates.find(g => g.id === id);
    if (!gate || owner !== gate.owner) throw new Error('Gate must be resolved by its declared accountable owner.');
    required(evidenceFile, 'Gate evidence path');
    const evidence = archive(data, 'gate-evidence', '.txt', fs.readFileSync(path.resolve(evidenceFile)));
    Object.assign(data.state.gates.find(g => g.id === id), { status: 'resolved', evidence: evidence.file, sha256: evidence.sha256, resolved_by: owner, resolved_at: timestamp() });
    return { event: { gate: id, owner, evidence: evidence.file } };
  });
}
export function closeGate(planDir, id, owner, reason) {
  return mutate(planDir, 'close-gate', data => {
    const gate = data.manifest.gates.find(g => g.id === id);
    if (!gate || owner !== gate.owner) throw new Error('Gate owner does not match.');
    required(reason, 'Gate closure reason');
    const state = data.state.gates.find(g => g.id === id), previous = structuredClone(state);
    Object.assign(state, { status: 'open', reason });
    return { event: { gate: id, owner, reason, previous } };
  });
}
export function splitPhase(planDir, id, owner, children, reason) {
  return mutate(planDir, 'split', data => {
    const { phase, state } = owned(data, id, owner);
    required(reason, 'Split reason');
    if (!Array.isArray(children) || children.length < 2) throw new Error('Split requires at least two complete child definitions.');
    const known = new Set(data.manifest.phases.map(p => p.id));
    for (const [index, child] of children.entries()) {
      if (!child || known.has(child.id)) throw new Error('Child IDs must be new and unique.');
      known.add(child.id);
      if (child.depends_on?.length) throw new Error('Split assigns child dependencies automatically; omit depends_on.');
      child.depends_on = index === 0 ? [...phase.depends_on] : [children[index - 1].id];
      child.gates = [...new Set([...phase.gates, ...(child.gates || [])])];
      if (!fs.statSync(within(data.dir, child.file)).isFile()) throw new Error('Child card is missing.');
    }
    phase.superseded_by = children.map(p => p.id);
    // Review gates are completion conditions, not prerequisites for every child.
    const terminal = children.at(-1);
    for (const criterion of phase.done.filter(d => d.gate)) {
      if (!terminal.done.some(d => d.gate === criterion.gate)) {
        terminal.done.push({ ...criterion, id: 'inherited_' + criterion.id.slice(0, 50) });
      }
    }
    for (const downstream of data.manifest.phases) downstream.depends_on = downstream.depends_on.map(dep => dep === id ? children.at(-1).id : dep);
    data.manifest.phases.splice(data.manifest.phases.indexOf(phase) + 1, 0, ...children);
    state.status = 'split'; delete state.owner;
    data.state.phases.push(...children.map(p => ({ id: p.id, status: 'planned' })));
    return { event: { phase: id, owner, reason, children: phase.superseded_by } };
  });
}
