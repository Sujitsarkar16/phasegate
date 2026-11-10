#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  initPlan, validatePlan, getStatus, getNextPrompt, createHandoffTemplate,
  startPhase, verifyPhase, completePhase, checkpointPhase, blockPhase, unblockPhase,
  reopenPhase, releasePhase, resolveGate, closeGate, splitPhase, recoverPlan
} from '../lib/index.js';
import { readJson } from '../lib/storage.js';

const help = [
  'PhaseGate — evidence-backed workflows for AI-assisted development',
  '',
  'Usage: phasegate <command> [phase_or_gate_id] [plan_directory] [options]',
  '       npx agentic-phase-gate <command> ...',
  '',
  'init [dir]       --name <name> --mode light|standard --workspace <dir> --context-budget <tokens>',
  'validate [dir]   Check schema, DAG, evidence, and basic Markdown structure',
  'status [dir]     Show derived readiness, claims, blockers, and stale phases',
  'next [dir]       Generate a prompt for an eligible phase',
  'start <id> [dir] --owner <session-owner>',
  'verify <id> [dir] --owner <session-owner> (executes the declared commands)',
  'handoff <id> [dir] Create an unverified draft',
  'complete <id> [dir] --owner <owner> --reviewer <name> --handoff <file>',
  'checkpoint <id> [dir] --owner <owner> --note <text>',
  'block <id> [dir] --owner <owner> --reason <text>',
  'unblock <id> [dir] --reason <text>',
  'reopen <id> [dir] --owner <owner> --reason <text> (also invalidates descendants)',
  'release <id> [dir] --owner <owner> --reason <text>',
  'resolve-gate <id> [dir] --owner <owner> --evidence <file>',
  'close-gate <id> [dir] --owner <owner> --reason <text>',
  'split <id> [dir] --owner <owner> --file <children.json> --reason <text>',
  'recover [dir]    Recover an interrupted transaction or dead local command lock',
  '',
  'All commands support --json. Omit the directory only in a plan or with one discoverable child plan.',
  '--help, -h       Show help',
  '--version, -v    Show version'
].join('\n');

function planDirectory(input) {
  if (input) return path.resolve(input);
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'phase-manifest.json'))) return cwd;
  const candidates = fs.readdirSync(cwd, { withFileTypes: true }).filter(d => d.isDirectory() &&
    fs.existsSync(path.join(cwd, d.name, 'phase-manifest.json'))).map(d => path.join(cwd, d.name));
  if (candidates.length === 1) return candidates[0];
  throw new Error(candidates.length ? 'Multiple plans found; specify the plan directory.' : 'No plan found; specify a directory or run init.');
}

const argv = process.argv.slice(2);
if (!argv.length || argv.some(a => ['--help', '-h'].includes(a)) || argv[0] === 'help') console.log(help);
else if (['--version', '-v'].includes(argv[0])) console.log(readJson(new URL('../package.json', import.meta.url)).version);
else {
  try {
    const command = argv[0], options = {}, positional = [];
    const optionNames = new Set(['name', 'mode', 'workspace', 'context-budget', 'owner', 'reviewer', 'handoff', 'note', 'reason', 'evidence', 'file']);
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--json') options.json = true;
      else if (argv[i].startsWith('--')) {
        const name = argv[i].slice(2);
        if (!optionNames.has(name) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Unknown option or missing value: ' + argv[i]);
        options[name] = argv[++i];
      } else positional.push(argv[i]);
    }
    const simple = ['init', 'validate', 'status', 'next', 'recover'];
    const phaseCommands = ['start', 'verify', 'handoff', 'complete', 'checkpoint', 'block', 'unblock', 'reopen', 'release', 'resolve-gate', 'close-gate', 'split'];
    if (![...simple, ...phaseCommands].includes(command)) throw new Error('Unknown command: ' + command);
    if (positional.length > (simple.includes(command) ? 1 : 2)) throw new Error('Too many positional arguments.');
    const id = simple.includes(command) ? null : positional[0];
    if (!simple.includes(command) && !id) throw new Error('Phase or gate ID is required.');
    const dir = command === 'init' ? positional[0] || './Implementation_Plan' : planDirectory(positional[id ? 1 : 0]);
    let result;
    switch (command) {
      case 'init': result = initPlan(dir, { name: options.name, mode: options.mode, workspace: options.workspace,
        contextBudget: options['context-budget'] === undefined ? undefined : Number(options['context-budget']) }); break;
      case 'validate': result = validatePlan(dir); if (!result.ok) process.exitCode = 1; break;
      case 'status': result = getStatus(dir); break;
      case 'next': result = getNextPrompt(dir); break;
      case 'recover': result = recoverPlan(dir); break;
      case 'start': result = startPhase(dir, id, options.owner); break;
      case 'verify': result = verifyPhase(dir, id, options.owner); if (!result.passed) process.exitCode = 1; break;
      case 'handoff': result = createHandoffTemplate(dir, id); break;
      case 'complete': result = completePhase(dir, id, options); break;
      case 'checkpoint': result = checkpointPhase(dir, id, options.owner, options.note); break;
      case 'block': result = blockPhase(dir, id, options.owner, options.reason); break;
      case 'unblock': result = unblockPhase(dir, id, options.reason); break;
      case 'reopen': result = reopenPhase(dir, id, options.owner, options.reason); break;
      case 'release': result = releasePhase(dir, id, options.owner, options.reason); break;
      case 'resolve-gate': result = resolveGate(dir, id, options.owner, options.evidence); break;
      case 'close-gate': result = closeGate(dir, id, options.owner, options.reason); break;
      case 'split': result = splitPhase(dir, id, options.owner, readJson(options.file), options.reason); break;
    }
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (command === 'status') {
      console.log(result.name + ': ' + result.completed + '/' + result.total + ' complete; next: ' + (result.nextPhase || 'none'));
      for (const row of result.phases) console.log(row.id + ' | ' + row.status + ' | ' + (row.owner || '') + ' | ' + row.name +
        (row.reasons.length ? '\n  ' + row.reasons.join(' ') : ''));
    } else if (command === 'validate') {
      console.log(result.ok ? 'PASS: plan structure and recorded evidence are valid.' : 'FAIL:\n' + result.errors.join('\n'));
      for (const warning of result.warnings) console.log('NOTE: ' + warning);
    } else {
      console.log(result.prompt || result.message || JSON.stringify(result, null, 2));
      if (result.evidence) console.log('Evidence: ' + path.join(dir, result.evidence));
    }
  } catch (error) {
    if (argv.includes('--json')) console.error(JSON.stringify({ error: error.message }));
    else console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
