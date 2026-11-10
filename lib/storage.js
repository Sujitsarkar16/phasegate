import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const jsonHash = value => digest(JSON.stringify(value));
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const timestamp = () => new Date().toISOString();

// Check existing ancestors too: lexical containment alone permits symlink escapes.
export function within(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) {
    throw new Error('Expected a relative path: ' + relative);
  }
  const base = fs.realpathSync(root);
  const target = path.resolve(base, relative);
  const contained = candidate => candidate === base || candidate.startsWith(base + path.sep);
  if (!contained(target)) throw new Error('Path escapes its root: ' + relative);
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!contained(fs.realpathSync(ancestor))) throw new Error('Symlink escapes its root: ' + relative);
  return target;
}

export function atomicWrite(file, contents) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}

export function exclusiveWrite(file, contents) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function withLock(planDir, operation) {
  const file = within(planDir, 'state/.lock');
  const token = crypto.randomUUID();
  try {
    exclusiveWrite(file, JSON.stringify({ token, pid: process.pid, host: os.hostname(), started_at: timestamp() }));
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Plan is locked by another command. Inspect state/.lock; use recover after its process exits.');
    throw error;
  }
  try {
    return operation();
  } finally {
    if (fs.existsSync(file) && readJson(file).token === token) fs.unlinkSync(file);
  }
}

export function refreshView(planDir, state) {
  const rows = state.phases.map(p => '| ' + p.id + ' | ' + p.status + ' | ' + (p.owner || '') + ' |');
  atomicWrite(within(planDir, 'state/CURRENT_STATE.md'),
    '# Current State\n\nGenerated from STATUS.json revision ' + state.revision +
    '. Run phasegate status for dependency readiness and stale evidence.\n\n' +
    '| Phase | Recorded state | Owner |\n| :--- | :--- | :--- |\n' + rows.join('\n') + '\n');
}

// A recoverable two-file transaction. A pending journal blocks ordinary commands.
export function commit(planDir, oldManifest, oldState, manifest, state, event) {
  if (jsonHash(readJson(within(planDir, 'phase-manifest.json'))) !== jsonHash(oldManifest) ||
      jsonHash(readJson(within(planDir, 'state/STATUS.json'))) !== jsonHash(oldState)) {
    throw new Error('Plan changed during this command; no state was committed. Reconcile the concurrent edit and retry.');
  }
  state.revision = oldState.revision + 1;
  state.updated_at = timestamp();
  state.events.push({ revision: state.revision, at: state.updated_at, ...event });
  const journal = {
    old_manifest_hash: jsonHash(oldManifest), old_state_hash: jsonHash(oldState),
    manifest, state
  };
  const pending = within(planDir, 'state/transaction.json');
  exclusiveWrite(pending, JSON.stringify(journal, null, 2));
  finishTransaction(planDir, journal);
}

function finishTransaction(planDir, journal) {
  atomicWrite(within(planDir, 'phase-manifest.json'), JSON.stringify(journal.manifest, null, 2) + '\n');
  atomicWrite(within(planDir, 'state/STATUS.json'), JSON.stringify(journal.state, null, 2) + '\n');
  refreshView(planDir, journal.state);
  fs.unlinkSync(within(planDir, 'state/transaction.json'));
}

export function recoverPlan(planDir) {
  const lock = within(planDir, 'state/.lock');
  if (fs.existsSync(lock)) {
    const info = readJson(lock);
    if (info.host !== os.hostname() || !Number.isInteger(info.pid) || info.pid <= 0) {
      throw new Error('Cannot establish that the lock owner has stopped on this host.');
    }
    try {
      process.kill(info.pid, 0);
      throw new Error('Lock owner process is still running.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    fs.unlinkSync(lock);
  }
  return withLock(planDir, () => {
    const pending = within(planDir, 'state/transaction.json');
    if (!fs.existsSync(pending)) {
      refreshView(planDir, readJson(within(planDir, 'state/STATUS.json')));
      return { recovered: false, message: 'No pending transaction; refreshed the state view.' };
    }
    const journal = readJson(pending);
    for (const [file, oldHash, next] of [
      ['phase-manifest.json', journal.old_manifest_hash, journal.manifest],
      ['state/STATUS.json', journal.old_state_hash, journal.state]
    ]) {
      const actual = jsonHash(readJson(within(planDir, file)));
      if (actual !== oldHash && actual !== jsonHash(next)) {
        throw new Error('Recovery refused: ' + file + ' changed outside the pending transaction. Preserve and reconcile it manually.');
      }
    }
    finishTransaction(planDir, journal);
    return { recovered: true, message: 'Completed the pending transaction.' };
  });
}
