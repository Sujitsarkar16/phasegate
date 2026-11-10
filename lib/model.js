import fs from 'node:fs';
import path from 'node:path';
import { readJson, within } from './storage.js';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(nonempty);
const unique = values => new Set(values).size === values.length;
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const validId = value => typeof value === 'string' && idPattern.test(value);
const states = ['planned', 'in_progress', 'needs_input', 'complete', 'split'];
export const gateIds = phase => [...new Set([...phase.gates, ...phase.done.filter(d => d.gate).map(d => d.gate)])];

export function schemaErrors(manifest, state) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  if (manifest?.schema_version !== 2 || state?.schema_version !== 2) {
    return ['Schema version 2 is required. See CLI_GUIDE.md for migration; legacy completion strings are not verification evidence.'];
  }
  check(nonempty(manifest.name), 'Manifest name is required.');
  check(nonempty(manifest.workspace), 'Manifest workspace is required (relative to the plan).');
  check(['light', 'standard'].includes(manifest.mode), 'Mode must be light or standard.');
  check(strings(manifest.policies), 'policies must be an array of relative file paths.');
  check(Array.isArray(manifest.phases) && manifest.phases.length > 0, 'At least one phase is required.');
  check(Array.isArray(manifest.gates), 'Manifest gates must be an array.');
  check(Array.isArray(state.phases), 'State phases must be an array.');
  check(Array.isArray(state.gates), 'State gates must be an array.');
  check(Number.isInteger(state.revision) && state.revision >= 0, 'State revision must be a nonnegative integer.');
  check(Array.isArray(state.events), 'State events must be an array.');
  if (errors.length) return errors;
  const phases = new Map(), statuses = new Map(), gates = new Map();
  for (const gate of manifest.gates) {
    if (!gate || !validId(gate.id) || !nonempty(gate.description) || !nonempty(gate.owner)) {
      errors.push('Each gate needs a valid id, description, and accountable owner.');
      continue;
    }
    check(!gates.has(gate.id), 'Duplicate gate: ' + gate.id);
    gates.set(gate.id, gate);
  }
  for (const p of manifest.phases) {
    if (!p || !validId(p.id)) { errors.push('Each phase needs a valid id.'); continue; }
    check(!phases.has(p.id), 'Duplicate phase: ' + p.id);
    phases.set(p.id, p);
    for (const key of ['name', 'file', 'objective']) check(nonempty(p[key]), p.id + ': missing ' + key);
    for (const key of ['depends_on', 'read', 'watch', 'gates', 'steps']) {
      check(strings(p[key]) && unique(p[key]), p.id + ': ' + key + ' must contain unique strings.');
    }
    check(Number.isInteger(p.context_budget_tokens) && p.context_budget_tokens > 0, p.id + ': context budget must be a positive integer.');
    check(Array.isArray(p.verify), p.id + ': verify must be an array.');
    check(Array.isArray(p.done) && p.done.length > 0, p.id + ': acceptance criteria are required.');
    if (!Array.isArray(p.verify) || !Array.isArray(p.done)) continue;
    const checks = new Set(), criteria = new Set();
    for (const v of p.verify) {
      if (!v || !validId(v.id) || !nonempty(v.command) || !strings(v.args) ||
          !Number.isInteger(v.timeout_ms) || v.timeout_ms < 1 || v.timeout_ms > 3600000) {
        errors.push(p.id + ': each check needs id, command, string args, and timeout_ms (1..3600000).');
        continue;
      }
      check(!checks.has(v.id), p.id + ': duplicate check ' + v.id);
      checks.add(v.id);
    }
    for (const d of p.done) {
      if (!d || !validId(d.id) || !nonempty(d.description)) {
        errors.push(p.id + ': invalid acceptance criterion.'); continue;
      }
      check(!criteria.has(d.id), p.id + ': duplicate acceptance criterion ' + d.id);
      criteria.add(d.id);
      check((strings(d.checks) && d.checks.length > 0 && !d.gate) ||
        (nonempty(d.gate) && d.checks === undefined), p.id + ': ' + d.id + ' must map to checks or one review gate.');
      if (strings(d.checks)) for (const id of d.checks) check(checks.has(id), p.id + ': criterion references unknown check ' + id);
      if (d.gate) check(gates.has(d.gate), p.id + ': criterion references unknown gate ' + d.gate);
    }
    if (strings(p.gates)) for (const id of p.gates) check(gates.has(id), p.id + ': unknown gate ' + id);
    if (p.superseded_by !== undefined) check(strings(p.superseded_by) && p.superseded_by.length > 0, p.id + ': invalid superseded_by.');
  }
  for (const s of state.phases) {
    if (!s || !phases.has(s.id)) { errors.push('State references an unknown phase.'); continue; }
    check(!statuses.has(s.id), 'Duplicate state: ' + s.id);
    statuses.set(s.id, s);
    check(states.includes(s.status), s.id + ': invalid recorded state.');
    if (s.status === 'in_progress') check(nonempty(s.owner), s.id + ': active phase needs an owner.');
    if (s.status === 'needs_input') check(nonempty(s.blocker), s.id + ': blocked phase needs a reason.');
    if (s.status === 'split') check(phases.get(s.id).superseded_by?.length, s.id + ': split phase needs replacement children.');
    if (s.status === 'complete') {
      check(nonempty(s.evidence), s.id + ': complete phase requires a verification record.');
      check(nonempty(s.handoff), s.id + ': complete phase requires a handoff record.');
      check(nonempty(s.handoff_sha256) && nonempty(s.reviewer), s.id + ': complete phase requires a reviewed handoff digest.');
    }
  }
  check(state.phases.filter(s => s?.status === 'in_progress').length <= 1, 'Only one active phase is allowed per plan/worktree.');
  for (const p of phases.values()) {
    check(statuses.has(p.id), 'Phase missing from state: ' + p.id);
    if (strings(p.depends_on)) for (const dep of p.depends_on) {
      check(phases.has(dep) && dep !== p.id, p.id + ': unknown or self dependency ' + dep);
      check(!phases.get(dep)?.superseded_by, p.id + ': dependency on a split parent must be rewired.');
    }
    if (strings(p.superseded_by)) for (const child of p.superseded_by) {
      check(phases.has(child) && child !== p.id, p.id + ': unknown replacement child ' + child);
    }
  }
  const gateStates = new Set();
  for (const g of state.gates) {
    check(g && gates.has(g.id) && !gateStates.has(g.id), 'Unknown or duplicate gate state.');
    if (!g) continue;
    gateStates.add(g.id);
    check(['open', 'resolved'].includes(g.status), 'Invalid gate state: ' + g.id);
    if (g.status === 'resolved') check(nonempty(g.evidence) && nonempty(g.sha256) && nonempty(g.resolved_by), g.id + ': resolved gate needs evidence and owner.');
  }
  for (const id of gates.keys()) check(gateStates.has(id), 'Gate missing from state: ' + id);
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push('Dependency cycle involving ' + id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of phases.get(id)?.depends_on || []) if (phases.has(dep)) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  if (!errors.length) for (const id of phases.keys()) visit(id);
  return errors;
}

export function loadPlan(planDir) {
  const dir = fs.realpathSync(path.resolve(planDir));
  if (fs.existsSync(within(dir, 'state/transaction.json'))) throw new Error('Pending transaction: run phasegate recover before continuing.');
  const manifest = readJson(within(dir, 'phase-manifest.json'));
  const state = readJson(within(dir, 'state/STATUS.json'));
  const errors = schemaErrors(manifest, state);
  if (errors.length) throw new Error(errors.join('\n'));
  // Workspace is intentionally allowed to be the parent of a plan.
  const workspace = fs.realpathSync(path.resolve(dir, manifest.workspace));
  if (dir === workspace || !dir.startsWith(workspace + path.sep)) throw new Error('Plan must be a subdirectory of its workspace.');
  for (const policy of manifest.policies) {
    if (!fs.statSync(within(dir, policy)).isFile()) throw new Error('Policy is not a file: ' + policy);
  }
  for (const p of manifest.phases) {
    if (!fs.statSync(within(dir, p.file)).isFile()) throw new Error('Phase card is not a file: ' + p.file);
    for (const relative of p.read) within(workspace, relative);
    for (const relative of p.watch) {
      const target = within(workspace, relative);
      if (target === dir || target.startsWith(dir + path.sep)) throw new Error('Watch paths must target source outside the active plan: ' + relative);
    }
  }
  return { dir, workspace, manifest, state };
}
