#!/usr/bin/env node
// Copy into a plan's scripts directory after installing agentic-phase-gate locally.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from 'agentic-phase-gate';
const plan = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = validatePlan(plan);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
