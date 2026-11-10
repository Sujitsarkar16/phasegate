import fs from 'node:fs';
import path from 'node:path';
import { inspectPlan } from './state.js';

function markdownErrors(dir) {
  const errors = [];
  function scan(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) { errors.push('Symlinks are not allowed in plan artifacts: ' + file); continue; }
      if (entry.isDirectory()) { scan(file); continue; }
      if (!entry.name.endsWith('.md')) continue;
      let fence = null;
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const marker = line.match(/^ {0,3}(\x60{3,}|~{3,})(.*)$/);
        if (marker) {
          if (!fence) fence = marker[1];
          else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
          continue;
        }
        if (fence) continue;
        for (const match of line.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
          const target = match[1].replace(/^<|>$/g, '').split('#')[0];
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
          let decoded;
          try { decoded = decodeURIComponent(target); } catch { decoded = target; }
          if (!fs.existsSync(path.resolve(path.dirname(file), decoded))) errors.push('Broken local link in ' + path.relative(dir, file) + ': ' + target);
        }
      }
      if (fence) errors.push('Unbalanced code fence in ' + path.relative(dir, file));
    }
  }
  scan(dir);
  return errors;
}

export function validatePlan(planDir) {
  try {
    const data = inspectPlan(planDir);
    const errors = markdownErrors(data.dir);
    const warnings = [];
    for (const row of data.rows) {
      if (['stale', 'blocked'].includes(row.status)) errors.push(...row.reasons.map(r => row.id + ': ' + r));
      else errors.push(...row.reasons.filter(r => r.startsWith('Discovery root is missing:')).map(r => row.id + ': ' + r));
      if (!row.phase.watch.length) warnings.push(row.id + ': no watched paths; source changes require an explicit impact review/reopen.');
      if (row.phase.verify.some(v => v.args.some(a => a.includes('Configure real project verification')))) {
        warnings.push(row.id + ': replace the deliberately failing scaffold verification.');
      }
    }
    return { ok: errors.length === 0, errors, warnings, stats: {
      phases: data.rows.length, completed: data.rows.filter(p => p.status === 'complete').length,
      nextPhase: data.rows.find(p => p.status === 'in_progress')?.id || data.rows.find(p => p.status === 'ready')?.id || null
    } };
  } catch (error) { return { ok: false, errors: [error.message], warnings: [] }; }
}
