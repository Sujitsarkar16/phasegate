import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { digest, jsonHash, readJson, within, exclusiveWrite, timestamp } from './storage.js';
import { gateIds } from './model.js';

function walk(root, relative, entries, excluded) {
  const full = path.join(root, relative);
  if (excluded(full)) return;
  if (!fs.existsSync(full)) { entries.push([relative, 'missing']); return; }
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error('Snapshot cannot follow symlinks: ' + relative);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full).sort()) walk(root, path.join(relative, name), entries, excluded);
  } else if (stat.isFile()) {
    entries.push([relative.replaceAll(path.sep, '/'), digest(fs.readFileSync(full)), stat.mode & 0o111]);
  }
}

export function snapshot(data, roots = null) {
  const entries = [];
  const excluded = full => full === data.dir || full.startsWith(data.dir + path.sep) ||
    path.relative(data.workspace, full).split(path.sep).some(p => p === '.git' || p === 'node_modules');
  let head = null;
  if (roots) {
    for (const relative of [...roots].sort()) {
      within(data.workspace, relative);
      walk(data.workspace, relative, entries, excluded);
    }
  } else {
    let tracked;
    try {
      tracked = execFileSync('git', ['-C', data.workspace, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      // A non-Git workspace is supported; a failing Git repository must not silently lose ignored-file semantics.
      if (fs.existsSync(path.join(data.workspace, '.git'))) throw new Error('Cannot enumerate the Git worktree: ' + error.message);
    }
    if (tracked !== undefined) {
      for (const relative of [...new Set(tracked.split('\0').filter(Boolean))].sort()) {
        within(data.workspace, relative);
        walk(data.workspace, relative, entries, excluded);
      }
      try {
        head = execFileSync('git', ['-C', data.workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      } catch { /* An initial repository may have no commit. */ }
    } else walk(data.workspace, '', entries, excluded);
  }
  return { sha256: jsonHash(entries), git_head: head, file_count: entries.length };
}

export function contractHash(data, phase) {
  return jsonHash({
    phase,
    card: digest(fs.readFileSync(within(data.dir, phase.file))),
    policies: data.manifest.policies.map(file => [file, digest(fs.readFileSync(within(data.dir, file)))]),
    gates: data.manifest.gates.filter(g => gateIds(phase).includes(g.id))
  });
}

export function dependencyHash(data, phase) {
  return jsonHash(phase.depends_on.map(id => {
    const s = data.state.phases.find(item => item.id === id);
    return [id, s?.evidence ? digest(fs.readFileSync(within(data.dir, s.evidence))) : null, s?.handoff_sha256];
  }));
}

export function gateHash(data, phase) {
  return jsonHash(gateIds(phase).map(id => data.state.gates.find(g => g.id === id)));
}

export function gateProblem(data, id) {
  const gate = data.state.gates.find(g => g.id === id);
  if (!gate || gate.status !== 'resolved') return 'Gate ' + id + ' is open.';
  try {
    const content = fs.readFileSync(within(data.dir, gate.evidence));
    if (!content.length || digest(content) !== gate.sha256) return 'Gate ' + id + ' evidence changed or is empty.';
    if (gate.resolved_by !== data.manifest.gates.find(g => g.id === id).owner) return 'Gate ' + id + ' owner changed.';
  } catch { return 'Gate ' + id + ' evidence is missing or invalid.'; }
  return null;
}

export function recordVerification(data, phase) {
  const runId = crypto.randomUUID();
  const relative = 'state/runs/' + runId;
  fs.mkdirSync(within(data.dir, relative));
  const before = snapshot(data);
  const contract = contractHash(data, phase);
  const dependencies = dependencyHash(data, phase);
  const started = timestamp();
  const checks = [];
  for (const check of phase.verify) {
    const log = relative + '/' + check.id + '.log';
    const fd = fs.openSync(within(data.dir, log), 'wx', 0o600);
    const begin = timestamp();
    let result;
    try {
      // No implicit shell, interpolation, or command-string parsing.
      result = spawnSync(check.command, check.args, {
        cwd: data.workspace, shell: false, timeout: check.timeout_ms,
        stdio: ['ignore', fd, fd], windowsHide: true
      });
    } finally { fs.closeSync(fd); }
    checks.push({
      id: check.id, command: check.command, args: check.args, started_at: begin, finished_at: timestamp(),
      exit_code: result.status, signal: result.signal || null, error: result.error?.message || null,
      log, log_sha256: digest(fs.readFileSync(within(data.dir, log)))
    });
    if (result.status !== 0 || result.error || result.signal) break;
  }
  const after = snapshot(data);
  const record = {
    schema_version: 1, phase_id: phase.id, started_at: started, finished_at: timestamp(),
    before, after, contract_hash: contract, dependency_hash: dependencies,
    watch_hash: snapshot(data, phase.watch).sha256, checks,
    passed: checks.length === phase.verify.length && checks.length > 0 &&
      checks.every(c => c.exit_code === 0 && !c.error && !c.signal) &&
      before.sha256 === after.sha256 && contract === contractHash(data, phase) &&
      dependencies === dependencyHash(data, phase)
  };
  const file = relative + '/verification.json';
  exclusiveWrite(within(data.dir, file), JSON.stringify(record, null, 2) + '\n');
  return { file, record };
}

export function evidenceProblems(data, phase, relative, current = false) {
  const errors = [];
  try {
    const r = readJson(within(data.dir, relative));
    if (r.schema_version !== 1 || r.phase_id !== phase.id || r.passed !== true ||
        !r.before?.sha256 || r.before.sha256 !== r.after?.sha256 ||
        !Number.isFinite(Date.parse(r.started_at)) || !Number.isFinite(Date.parse(r.finished_at)) ||
        Date.parse(r.finished_at) < Date.parse(r.started_at)) errors.push('Missing or unsuccessful verification record.');
    if (r.contract_hash !== contractHash(data, phase)) errors.push('Phase definition, card, or policy changed.');
    if (r.dependency_hash !== dependencyHash(data, phase)) errors.push('Prerequisite evidence changed.');
    if (r.watch_hash !== snapshot(data, phase.watch).sha256) errors.push('Watched source contracts changed.');
    if (current && r.after?.sha256 !== snapshot(data).sha256) errors.push('Workspace changed after verification; run verify again.');
    if (!Array.isArray(r.checks) || r.checks.length !== phase.verify.length || phase.verify.length === 0) {
      errors.push('Verification does not cover all declared checks.');
    } else {
      for (let i = 0; i < phase.verify.length; i++) {
        const expected = phase.verify[i], actual = r.checks[i];
        if (!actual || actual.id !== expected.id || actual.command !== expected.command ||
            jsonHash(actual.args) !== jsonHash(expected.args) || actual.exit_code !== 0 || actual.error || actual.signal) {
          errors.push('Check did not pass: ' + expected.id); continue;
        }
        if (digest(fs.readFileSync(within(data.dir, actual.log))) !== actual.log_sha256) {
          errors.push('Check log changed: ' + expected.id);
        }
      }
    }
  } catch (error) { errors.push('Cannot read verification evidence: ' + error.message); }
  return errors;
}
