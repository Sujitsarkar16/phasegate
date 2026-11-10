import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as api from '../lib/index.js';
import { readJson, jsonHash, withLock, within } from '../lib/storage.js';

const cli = fileURLToPath(new URL('../bin/phasegate.js', import.meta.url));
const roots = [];
test.after(() => {
  for (const root of roots) {
    const absolute = fs.realpathSync(root), temp = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(absolute), temp);
    assert.ok(path.basename(absolute).startsWith('phasegate-test-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  }
});
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
function fixture(mode = 'standard') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phasegate-test-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'source.txt'), 'initial source\n');
  const dir = path.join(root, 'plan');
  api.initPlan(dir, { mode });
  const manifestFile = path.join(dir, 'phase-manifest.json'), stateFile = path.join(dir, 'state/STATUS.json');
  function edit(fn) {
    const m = readJson(manifestFile), s = readJson(stateFile);
    fn(m, s); writeJson(manifestFile, m); writeJson(stateFile, s);
  }
  edit(m => {
    for (const p of m.phases) {
      p.read = ['source.txt'];
      p.verify = [{ id: 'test', command: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 10000 }];
      p.done = [{ id: 'A1', description: 'Fixture behavior is verified.', checks: ['test'] }];
    }
  });
  const handoff = path.join(dir, 'state/drafts/review.md');
  fs.writeFileSync(handoff, '# Reviewed outcome\n\nThe fixture behavior, checks, diff, and residual risks were reviewed.\n');
  const finish = (id = 'P00') => {
    api.startPhase(dir, id, 'alice');
    assert.equal(api.verifyPhase(dir, id, 'alice').passed, true);
    api.completePhase(dir, id, { owner: 'alice', reviewer: 'reviewer', handoff });
  };
  return { root, dir, edit, finish, handoff, manifestFile, stateFile };
}
function run(args, cwd) { return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }); }

test('fresh scaffold never invents a baseline pass and its placeholder verification fails', () => {
  const f = fixture();
  assert.equal(api.getStatus(f.dir).completed, 0);
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00');
  assert.equal(readJson(f.stateFile).phases[0].evidence, undefined);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phasegate-test-')); roots.push(root);
  const dir = path.join(root, 'new');
  api.initPlan(dir);
  assert.equal(api.validatePlan(dir).ok, true);
  api.startPhase(dir, 'P00', 'alice');
  assert.equal(api.verifyPhase(dir, 'P00', 'alice').passed, false);
});
test('light mode is one configurable feature phase and works without package.json', () => {
  const f = fixture('light');
  assert.equal(api.getStatus(f.dir).total, 1);
  f.finish();
  assert.equal(api.getNextPrompt(f.dir).message, 'All current phases are complete.');
});
test('empty, legacy, malformed, and mismatched schemas fail closed', () => {
  for (const bad of [{}, { schema_version: 1 }, { schema_version: 2, phases: 'wrong' }, null]) {
    const f = fixture(); writeJson(f.manifestFile, bad);
    assert.equal(api.validatePlan(f.dir).ok, false);
  }
  const f = fixture(); f.edit((m, s) => s.phases.pop());
  assert.equal(api.validatePlan(f.dir).ok, false);
});
test('cycles, duplicate IDs, and unmapped acceptance checks are rejected', () => {
  for (const change of [
    m => { m.phases[0].depends_on = ['P01']; },
    m => { m.phases.push(structuredClone(m.phases[0])); },
    m => { m.phases[0].done[0].checks = ['nonexistent']; }
  ]) {
    const f = fixture(); f.edit(change);
    assert.equal(api.validatePlan(f.dir).ok, false);
  }
});
test('readiness is derived and unfinished dependencies cannot start', () => {
  const f = fixture();
  assert.throws(() => api.startPhase(f.dir, 'P01', 'alice'), /planned/);
  f.edit((m, s) => { s.next_phase = 'P01'; });
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00');
  f.finish();
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P01');
});
test('next does not report blocked work as completion', () => {
  const f = fixture();
  api.startPhase(f.dir, 'P00', 'alice');
  api.blockPhase(f.dir, 'P00', 'alice', 'Awaiting test environment');
  const result = api.getNextPrompt(f.dir);
  assert.equal(result.nextId, null);
  assert.match(result.message, /No executable phase/);
  api.unblockPhase(f.dir, 'P00', 'Environment available');
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00');
});
test('an independent branch remains eligible when another phase needs input', () => {
  const f = fixture();
  f.edit(m => { m.phases[1].depends_on = []; });
  api.startPhase(f.dir, 'P00', 'alice');
  api.blockPhase(f.dir, 'P00', 'alice', 'External dependency');
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P01');
});
test('completion rejects a fabricated check string and empty handoff', () => {
  const f = fixture();
  api.startPhase(f.dir, 'P00', 'alice');
  f.edit((m, s) => { s.phases[0].completed_checks = ['PASS']; s.phases[0].verification = 'state/drafts/fake.json'; });
  fs.writeFileSync(path.join(f.dir, 'state/drafts/fake.json'), JSON.stringify({ passed: true }));
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /verification|Verification|changed/);
  api.verifyPhase(f.dir, 'P00', 'alice');
  fs.writeFileSync(f.handoff, '');
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /empty/);
});
test('real verification records exit codes, log digests, and snapshots', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e', 'console.log("actual check output")']; });
  api.startPhase(f.dir, 'P00', 'alice');
  const result = api.verifyPhase(f.dir, 'P00', 'alice');
  assert.equal(result.passed, true);
  const record = readJson(path.join(f.dir, result.evidence));
  assert.equal(record.before.sha256, record.after.sha256);
  assert.equal(record.checks[0].exit_code, 0);
  assert.match(fs.readFileSync(path.join(f.dir, record.checks[0].log), 'utf8'), /actual check output/);
});
test('nonzero exit, missing executable, and timeout cannot complete', () => {
  for (const command of [
    { command: process.execPath, args: ['-e', 'process.exit(7)'], timeout_ms: 10000 },
    { command: 'phasegate-nonexistent-executable', args: [], timeout_ms: 10000 },
    { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeout_ms: 100 }
  ]) {
    const f = fixture(); f.edit(m => Object.assign(m.phases[0].verify[0], command));
    api.startPhase(f.dir, 'P00', 'alice');
    assert.equal(api.verifyPhase(f.dir, 'P00', 'alice').passed, false);
    assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }));
  }
});
test('verification requires every check and stops on a failure', () => {
  const f = fixture();
  f.edit(m => {
    m.phases[0].verify[0].args = ['-e', 'process.exit(1)'];
    m.phases[0].verify.push({ id: 'second', command: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 10000 });
  });
  api.startPhase(f.dir, 'P00', 'alice');
  const result = api.verifyPhase(f.dir, 'P00', 'alice');
  assert.equal(result.passed, false); assert.equal(result.checks.length, 1);
});
test('changes during verification fail input stability checks', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e', "require('node:fs').writeFileSync('source.txt','changed')"]; });
  api.startPhase(f.dir, 'P00', 'alice');
  assert.equal(api.verifyPhase(f.dir, 'P00', 'alice').passed, false);
});
test('source edits after verification require another run', () => {
  const f = fixture();
  api.startPhase(f.dir, 'P00', 'alice'); api.verifyPhase(f.dir, 'P00', 'alice');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'changed');
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /Workspace changed/);
  assert.equal(api.verifyPhase(f.dir, 'P00', 'alice').passed, true);
  api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff });
});
test('watched contract changes invalidate completed phases and their descendants', () => {
  const f = fixture(); f.edit(m => { m.phases[0].watch = ['source.txt']; });
  f.finish(); f.finish('P01');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'changed contract');
  assert.deepEqual(api.getStatus(f.dir).phases.map(p => p.status), ['stale', 'stale']);
  assert.equal(api.validatePlan(f.dir).ok, false);
  assert.equal(api.getNextPrompt(f.dir).nextId, null);
});
test('historical completion survives unrelated later work', () => {
  const f = fixture(); f.finish();
  fs.writeFileSync(path.join(f.root, 'new-feature.txt'), 'later work');
  assert.equal(api.getStatus(f.dir).phases[0].status, 'complete');
  f.finish('P01');
  assert.equal(api.validatePlan(f.dir).ok, true);
});
test('phase definitions and policy edits invalidate historical evidence', () => {
  for (const change of [
    f => f.edit(m => { m.phases[0].objective += ' new requirement'; }),
    f => fs.appendFileSync(path.join(f.dir, 'CODING_STANDARDS.md'), '\nNew policy.\n'),
    f => fs.appendFileSync(path.join(f.dir, 'phases/p00.md'), '\nNew requirement.\n')
  ]) {
    const f = fixture(); f.finish(); change(f);
    assert.equal(api.getStatus(f.dir).phases[0].status, 'stale');
  }
});
test('edited logs and handoffs are detected', () => {
  for (const target of ['log', 'handoff']) {
    const f = fixture(); f.finish();
    const s = readJson(f.stateFile).phases[0];
    const file = target === 'handoff' ? s.handoff : readJson(path.join(f.dir, s.evidence)).checks[0].log;
    fs.appendFileSync(path.join(f.dir, file), 'tampered');
    assert.equal(api.validatePlan(f.dir).ok, false);
  }
});
test('draft handoffs never assert completion and cannot be submitted unchanged', () => {
  const f = fixture(); api.startPhase(f.dir, 'P00', 'alice'); api.verifyPhase(f.dir, 'P00', 'alice');
  const draft = api.createHandoffTemplate(f.dir, 'P00');
  assert.match(fs.readFileSync(draft.path, 'utf8'), /phasegate:draft/);
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: draft.path }), /draft/);
  assert.equal(api.createHandoffTemplate(f.dir, 'P00').created, false);
  assert.throws(() => api.createHandoffTemplate(f.dir, '../../escape'));
});
test('claims prevent conflicting owners and simultaneous phases', () => {
  const f = fixture(); f.edit(m => { m.phases[1].depends_on = []; });
  api.startPhase(f.dir, 'P00', 'alice');
  assert.throws(() => api.startPhase(f.dir, 'P00', 'bob'), /claimed/);
  assert.throws(() => api.startPhase(f.dir, 'P01', 'alice'), /claimed/);
  assert.throws(() => api.verifyPhase(f.dir, 'P00', 'bob'), /started/);
  api.checkpointPhase(f.dir, 'P00', 'alice', 'Found the relevant service and failing test.');
  api.releasePhase(f.dir, 'P00', 'alice', 'Handing work to Bob.');
  api.startPhase(f.dir, 'P00', 'bob');
  assert.match(readJson(f.stateFile).phases[0].checkpoint.note, /service/);
});
test('command lock rejects competing writes and recovery refuses a live process', () => {
  const f = fixture();
  withLock(f.dir, () => {
    assert.throws(() => api.startPhase(f.dir, 'P00', 'alice'), /locked/);
    assert.throws(() => api.recoverPlan(f.dir), /still running/);
  });
  api.startPhase(f.dir, 'P00', 'alice');
});
test('reopen invalidates descendants and preserves old evidence', () => {
  const f = fixture(); f.finish(); f.finish('P01');
  const oldEvidence = readJson(f.stateFile).phases[1].evidence;
  assert.deepEqual(api.reopenPhase(f.dir, 'P00', 'alice', 'Requirements changed').reopened, ['P00', 'P01']);
  assert.equal(fs.existsSync(path.join(f.dir, oldEvidence)), true);
  assert.deepEqual(api.getStatus(f.dir).phases.map(p => p.status), ['ready', 'planned']);
  assert.equal(readJson(f.stateFile).events.at(-1).previous[1].evidence, oldEvidence);
});
test('external prerequisite gates block start, require their owner, and preserve evidence', () => {
  const f = fixture();
  f.edit((m, s) => {
    m.gates = [{ id: 'G1', description: 'Test environment available', owner: 'ops' }];
    m.phases[0].gates = ['G1']; s.gates = [{ id: 'G1', status: 'open' }];
  });
  assert.throws(() => api.startPhase(f.dir, 'P00', 'alice'), /Gate G1/);
  assert.throws(() => api.resolveGate(f.dir, 'G1', 'alice', f.handoff), /owner/);
  api.resolveGate(f.dir, 'G1', 'ops', f.handoff); f.finish();
  api.closeGate(f.dir, 'G1', 'ops', 'Environment revoked');
  assert.equal(api.getStatus(f.dir).phases[0].status, 'stale');
});
test('manual acceptance gates permit implementation but block completion', () => {
  const f = fixture();
  f.edit((m, s) => {
    m.gates = [{ id: 'REVIEW', description: 'Acceptance reviewed', owner: 'reviewer' }];
    m.phases[0].done.push({ id: 'A2', description: 'Operator acceptance', gate: 'REVIEW' });
    s.gates = [{ id: 'REVIEW', status: 'open' }];
  });
  api.startPhase(f.dir, 'P00', 'alice'); api.verifyPhase(f.dir, 'P00', 'alice');
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /Gate REVIEW/);
  api.resolveGate(f.dir, 'REVIEW', 'reviewer', f.handoff);
  api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'reviewer', handoff: f.handoff });
});
test('split preserves prerequisites and redirects downstream dependencies', () => {
  const f = fixture(); api.startPhase(f.dir, 'P00', 'alice');
  const parent = readJson(f.manifestFile).phases[0];
  const children = ['P00A', 'P00B'].map(id => {
    const child = { ...structuredClone(parent), id, file: 'phases/' + id + '.md' }; delete child.depends_on;
    fs.writeFileSync(path.join(f.dir, child.file), '# ' + id + '\n'); return child;
  });
  api.splitPhase(f.dir, 'P00', 'alice', children, 'Separate contract and integration.');
  assert.equal(api.validatePlan(f.dir).ok, true);
  const m = readJson(f.manifestFile);
  assert.deepEqual(m.phases.find(p => p.id === 'P01').depends_on, ['P00B']);
  assert.deepEqual(m.phases.find(p => p.id === 'P00B').depends_on, ['P00A']);
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00A');
  f.finish('P00A'); f.finish('P00B'); f.finish('P01');
  assert.equal(api.getNextPrompt(f.dir).message, 'All current phases are complete.');
  assert.equal(api.getStatus(f.dir).completed, api.getStatus(f.dir).total);
});
test('invalid split does not change the canonical plan', () => {
  const f = fixture(); api.startPhase(f.dir, 'P00', 'alice');
  const original = fs.readFileSync(f.manifestFile, 'utf8');
  assert.throws(() => api.splitPhase(f.dir, 'P00', 'alice', [{ id: 'P00' }, { id: 'P02' }], 'Split'));
  assert.equal(fs.readFileSync(f.manifestFile, 'utf8'), original);
});
function pendingTransaction(f) {
  const manifest = readJson(f.manifestFile), state = readJson(f.stateFile);
  const next = structuredClone(state); next.revision++; next.events.push({ action: 'test-recovery' });
  const nextManifest = structuredClone(manifest); nextManifest.name += ' recovered';
  const journal = { old_manifest_hash: jsonHash(manifest), old_state_hash: jsonHash(state), manifest: nextManifest, state: next };
  writeJson(path.join(f.dir, 'state/transaction.json'), journal);
  return journal;
}
test('pending transaction blocks reads and recovery finishes either partial state', () => {
  for (const alreadyWritten of ['none', 'manifest', 'state', 'both']) {
    const f = fixture(), journal = pendingTransaction(f);
    if (['manifest', 'both'].includes(alreadyWritten)) writeJson(f.manifestFile, journal.manifest);
    if (['state', 'both'].includes(alreadyWritten)) writeJson(f.stateFile, journal.state);
    assert.equal(api.validatePlan(f.dir).ok, false);
    assert.equal(api.recoverPlan(f.dir).recovered, true);
    assert.equal(readJson(f.stateFile).revision, 1);
    assert.match(readJson(f.manifestFile).name, /recovered/);
    assert.equal(api.validatePlan(f.dir).ok, true);
  }
});
test('recovery refuses to overwrite unrelated edits', () => {
  const f = fixture(); pendingTransaction(f);
  const state = readJson(f.stateFile); state.revision = 12; writeJson(f.stateFile, state);
  assert.throws(() => api.recoverPlan(f.dir), /changed outside/);
  assert.equal(readJson(f.stateFile).revision, 12);
});
test('path traversal and missing cards fail validation', () => {
  for (const file of ['../../outside.md', 'phases/missing.md']) {
    const f = fixture(); f.edit(m => { m.phases[0].file = file; });
    assert.equal(api.validatePlan(f.dir).ok, false);
  }
  const f = fixture();
  assert.throws(() => within(f.dir, '../outside'), /escapes/);
});
test('basic Markdown validation catches broken links and unclosed fences', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.dir, 'notes.md'), '[Missing](no-such-file.md)\n~~~js\n');
  const result = api.validatePlan(f.dir);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('Broken local link')));
  assert.ok(result.errors.some(e => e.includes('Unbalanced')));
});
test('CLI discovers a single plan and refuses ambiguous selection', () => {
  const f = fixture();
  assert.equal(JSON.parse(run(['next', '--json'], f.root).stdout).nextId, 'P00');
  api.initPlan(path.join(f.root, 'second'));
  const result = run(['next'], f.root);
  assert.equal(result.status, 1); assert.match(result.stderr, /Multiple plans/);
});
test('CLI verification exit codes and JSON errors reflect failures', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e', 'process.exit(3)']; });
  assert.equal(run(['start', 'P00', f.dir, '--owner', 'alice'], f.root).status, 0);
  const result = run(['verify', 'P00', f.dir, '--owner', 'alice', '--json'], f.root);
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).passed, false);
  assert.equal(run(['start', 'P00', f.dir, '--unknown'], f.root).status, 1);
});
test('Git fingerprints include untracked source and ignore ignored output', () => {
  const f = fixture();
  const git = spawnSync('git', ['init', '-q', f.root], { encoding: 'utf8' });
  assert.equal(git.status, 0, 'Git must be available for the Git snapshot test.');
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'ignored.log\n');
  api.startPhase(f.dir, 'P00', 'alice'); api.verifyPhase(f.dir, 'P00', 'alice');
  fs.writeFileSync(path.join(f.root, 'ignored.log'), 'test output');
  api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff });
  api.startPhase(f.dir, 'P01', 'alice'); api.verifyPhase(f.dir, 'P01', 'alice');
  fs.writeFileSync(path.join(f.root, 'untracked-source.txt'), 'new code');
  assert.throws(() => api.completePhase(f.dir, 'P01', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /Workspace changed/);
});
test('schema validation does not execute declared commands', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e', "require('node:fs').writeFileSync('executed.txt','bad')"]; });
  assert.equal(api.validatePlan(f.dir).ok, true);
  assert.equal(fs.existsSync(path.join(f.root, 'executed.txt')), false);
});
test('missing or nonstring identifiers cannot pass by coercion', () => {
  for (const change of [
    m => { delete m.phases[0].id; },
    m => { m.phases[0].id = null; },
    m => { delete m.phases[0].verify[0].id; },
    m => { delete m.phases[0].done[0].id; }
  ]) {
    const f = fixture(); f.edit(change);
    assert.equal(api.validatePlan(f.dir).ok, false);
  }
});
test('out-of-band plan edits during a command are preserved and refuse commit', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e',
    "const fs=require('node:fs');const file='plan/phase-manifest.json';const m=JSON.parse(fs.readFileSync(file));m.name='external change';fs.writeFileSync(file,JSON.stringify(m));"]; });
  api.startPhase(f.dir, 'P00', 'alice');
  assert.throws(() => api.verifyPhase(f.dir, 'P00', 'alice'), /changed during this command/);
  assert.equal(readJson(f.manifestFile).name, 'external change');
  assert.equal(readJson(f.stateFile).phases[0].verification, undefined);
});
test('split carries parent completion review gates without blocking the first child', () => {
  const f = fixture();
  f.edit((m, s) => {
    m.gates = [{ id: 'REVIEW', owner: 'reviewer', description: 'External acceptance' }];
    m.phases[0].done.push({ id: 'A2', description: 'External review', gate: 'REVIEW' });
    s.gates = [{ id: 'REVIEW', status: 'open' }];
  });
  api.startPhase(f.dir, 'P00', 'alice');
  const parent = readJson(f.manifestFile).phases[0];
  const children = ['P00A', 'P00B'].map(id => {
    const child = { ...structuredClone(parent), id, file: 'phases/' + id + '.md', done: [parent.done[0]] };
    delete child.depends_on; fs.writeFileSync(path.join(f.dir, child.file), '# ' + id); return child;
  });
  api.splitPhase(f.dir, 'P00', 'alice', children, 'Separate acceptance work.');
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00A');
  const last = readJson(f.manifestFile).phases.find(p => p.id === 'P00B');
  assert.equal(last.done.some(d => d.gate === 'REVIEW'), true);
  f.finish('P00A'); api.startPhase(f.dir, 'P00B', 'alice'); api.verifyPhase(f.dir, 'P00B', 'alice');
  assert.throws(() => api.completePhase(f.dir, 'P00B', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /Gate REVIEW/);
});
test('symlinked artifact and initialization paths cannot escape their roots', () => {
  const f = fixture(), other = fixture();
  fs.symlinkSync(other.root, path.join(f.root, 'escape'), 'junction');
  assert.throws(() => api.initPlan(path.join(f.root, 'escape', 'new-plan'), { workspace: f.root }), /Symlink escapes/);
  fs.symlinkSync(other.root, path.join(f.dir, 'phases', 'escape'), 'junction');
  f.edit(m => { m.phases[0].file = 'phases/escape/source.txt'; });
  assert.equal(api.validatePlan(f.dir).ok, false);
  assert.equal(fs.existsSync(path.join(other.root, 'new-plan')), false);
});
test('recovery clears a demonstrably dead local command lock', () => {
  const f = fixture();
  const exited = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
  writeJson(path.join(f.dir, 'state/.lock'), { pid: Number(exited.stdout.trim()), host: os.hostname(), token: 'old' });
  assert.equal(api.recoverPlan(f.dir).recovered, false);
  api.startPhase(f.dir, 'P00', 'alice');
});
test('a newer failed run cannot reuse an older passing candidate', () => {
  const f = fixture();
  f.edit(m => { m.phases[0].verify[0].args = ['-e',
    "process.exit(require('node:fs').existsSync('plan/state/force-failure') ? 1 : 0)"]; });
  api.startPhase(f.dir, 'P00', 'alice');
  assert.equal(api.verifyPhase(f.dir, 'P00', 'alice').passed, true);
  fs.writeFileSync(path.join(f.dir, 'state/force-failure'), 'fail');
  assert.equal(api.verifyPhase(f.dir, 'P00', 'alice').passed, false);
  assert.throws(() => api.completePhase(f.dir, 'P00', { owner: 'alice', reviewer: 'r', handoff: f.handoff }), /unsuccessful|did not pass/);
});
test('deleted discovery contracts show stale status and can be reopened for repair', () => {
  const f = fixture(); f.edit(m => { m.phases[0].watch = ['source.txt']; }); f.finish();
  fs.unlinkSync(path.join(f.root, 'source.txt'));
  assert.equal(api.getStatus(f.dir).phases[0].status, 'stale');
  assert.equal(api.validatePlan(f.dir).ok, false);
  assert.doesNotThrow(() => api.reopenPhase(f.dir, 'P00', 'alice', 'Replace the deleted contract'));
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'replacement');
  assert.equal(api.getNextPrompt(f.dir).nextId, 'P00');
});
