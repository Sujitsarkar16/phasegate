# PhaseGate CLI and schema

Use `node /path/to/agentic-phase-gate/bin/phasegate.js` from a source checkout, the installed `phasegate` executable, or `npx agentic-phase-gate`. The npm package name is `agentic-phase-gate`.

Version 2 requires Node.js 18+. It has no runtime dependencies. All commands accept `--json`; validation and verification failures exit with code 1. Read-only `next` returns a message when blocked; it does not claim completion unless every phase is complete or replaced by children.

## Commands

| Command | Required or useful options | Effect |
| :--- | :--- | :--- |
| `init [dir]` | `--name`, `--mode light|standard`, `--workspace`, `--context-budget` | Creates an unverified plan; default directory `Implementation_Plan`, budget 32000 |
| `validate [dir]` | | Validates schema, DAG, artifact evidence, and basic Markdown structure; never runs verification |
| `status [dir]` | | Shows derived readiness, ownership, reasons, and staleness |
| `next [dir]` | | Produces a start/resume prompt for eligible work |
| `start <id> [dir]` | `--owner` | Claims a ready phase or resumes the same owner's active phase |
| `verify <id> [dir]` | `--owner` | Executes declared programs and captures evidence; failures exit 1 |
| `handoff <id> [dir]` | | Creates a draft without overwriting an existing draft |
| `complete <id> [dir]` | `--owner`, `--reviewer`, `--handoff` | Checks current evidence and gates, archives a reviewed handoff, and completes |
| `checkpoint <id> [dir]` | `--owner`, `--note` | Records a resumable note and source fingerprint |
| `block <id> [dir]` | `--owner`, `--reason` | Releases the active claim and records missing input |
| `unblock <id> [dir]` | `--reason` | Returns a blocked phase to planned; prerequisites still control readiness |
| `release <id> [dir]` | `--owner`, `--reason` | Releases a claim for a coordinated handoff, requiring fresh verification |
| `reopen <id> [dir]` | `--owner`, `--reason` | Resets this phase and its descendants; retains evidence/history |
| `resolve-gate <id> [dir]` | `--owner`, `--evidence` | Copies actual evidence and records the declared accountable owner |
| `close-gate <id> [dir]` | `--owner`, `--reason` | Reopens a gate; completed consumers become stale |
| `split <id> [dir]` | `--owner`, `--file`, `--reason` | Replaces an active phase with a sequential chain defined in a JSON array |
| `recover [dir]` | | Recovers a pending transaction or a dead local command lock |

When a directory is omitted, the CLI uses the current plan or exactly one immediate child plan. Multiple candidates require an explicit directory. Evidence and handoff CLI paths are resolved relative to the caller's working directory.

A plan must be a subdirectory of its workspace. `--workspace` defaults to the plan's parent. Paths in the manifest are relative to their documented roots; source paths may not escape the workspace and artifact paths may not escape the plan, including through symlinks.

## A phase definition

The manifest stores `schema_version: 2`, `name`, `mode`, a workspace path relative to the plan, `policies` relative to the plan, `gates`, and `phases`. Use the scaffold as the complete top-level example.

```json
{
  "id": "P01",
  "name": "Authorized invoice download",
  "file": "phases/p01.md",
  "objective": "Allow an authorized account member to download an invoice.",
  "depends_on": ["P00"],
  "read": ["src/invoices", "test/invoices.test.js"],
  "watch": ["src/invoices", "test/invoices.test.js", "package-lock.json"],
  "gates": [],
  "context_budget_tokens": 32000,
  "steps": ["Inspect the authorization boundary", "Implement the download", "Verify access and failure cases"],
  "done": [
    {"id": "A1", "description": "Members download only their account's invoices", "checks": ["invoice-tests"]},
    {"id": "A2", "description": "Error states are accessible", "gate": "UX_REVIEW"}
  ],
  "verify": [
    {"id": "invoice-tests", "command": "node", "args": ["--test", "test/invoices.test.js"], "timeout_ms": 120000}
  ]
}
```

IDs start with a letter and use letters, numbers, underscores, or hyphens, up to 64 characters. Phase IDs and check IDs are unique within their respective scopes. `done` must be nonempty. Each criterion maps to existing check IDs or one declared review gate. Checks specify an executable, argument array, and timeout of 1?3600000 milliseconds. An empty verification array cannot pass verification or completion.

`read` lists discovery starting points that exist. `watch` lists files/directories whose content, deletion, or later creation affects historical validity. These are plain paths, not glob patterns. A missing watched path is fingerprinted as missing. The phase budget is configurable planning metadata; the CLI cannot meter an agent's token use.

`policies` are files shared across phases whose edits invalidate their evidence. Keep policy content stable; record phase-specific findings in cards or handoffs. Cards contain context, not a duplicate status field. Editing a completed phase's card is a contract change and requires revalidation.

## Commands and environments

There is no implicit shell expansion, pipeline parsing, or interpolation. For example, use `{"command":"node","args":["--test"],"timeout_ms":120000,"id":"tests"}` for Node's test runner. Direct tools such as `cargo` and `python` can also be used if available on PATH.

On Windows, package-manager launchers such as `npm.cmd` require an explicit shell command, for example:

```json
{"id":"tests","command":"cmd.exe","args":["/d","/c","npm test"],"timeout_ms":120000}
```

On POSIX systems, an executable `npm` can normally be invoked directly with `args: ["test"]`. Review shell commands before running them. Never insert untrusted input or secret values into a command string. Commands execute from the declared workspace and inherit the caller's environment. Record relevant runtime/service versions and test-data provenance in the handoff.

Logs can contain anything the commands print. Keep credentials out of command output and follow your repository's evidence retention rules. A command that modifies nonignored source causes verification to fail until inputs are stable; build output should use an appropriate ignored directory. `node_modules` and the active plan are excluded from workspace snapshots. Watch lockfiles and check the actual dependency/runtime environment separately.

## Gates

Define gates in the manifest and initialize corresponding state entries when authoring a plan:

```json
{"id":"UX_REVIEW","description":"Review accessible invoice errors against acceptance","owner":"design-reviewer"}
```

```json
{"id":"UX_REVIEW","status":"open"}
```

Put a gate ID in `phase.gates` if it must be resolved before work starts. Use `done[].gate` when implementation can proceed and review is needed only to complete. Resolution requires a nonempty evidence file and the declared owner label. Labels record accountability; authentication must come from the surrounding review/CI system.

## Ownership, recovery, and scope changes

Use a distinct owner label per session/worker. Only one phase may be active per plan. Use separate worktrees for concurrent plans; the lock does not coordinate separate plans in one workspace. Merge changes through ordinary review and run an integration phase against the combined code.

Long-running commands hold `state/.lock`. If a process dies, `recover` checks the PID and host before clearing the lock. It refuses a live process, a remote/unknown owner, or a conflicting pending transaction. After recovering the command, the phase claim still exists. To transfer it, coordinate with the old owner and record `release` under the existing label before starting under the new label.

Use `checkpoint` before a session boundary. If requirements or watched contracts change, use `reopen` with a reason; it resets descendants, preserves old evidence, and computes readiness again. Resolve an affected claim held by another owner before reopening.

For `split`, create a JSON array containing at least two complete child phase definitions and create their cards first. Omit `depends_on` in the children: the command assigns inherited prerequisites to the first child and a chain thereafter. It preserves prerequisite gates, carries parent review gates to the terminal child, and redirects downstream dependencies. Check that all parent criteria are covered by the children. The transaction does not revert source changes already made.

Author phase definitions/cards before a command, while other writers are stopped. Use CLI commands for lifecycle transitions. If the manifest or ledger changes during a command, the commit is refused rather than overwriting that edit.

## Migrating version 1 plans

Version 1's free-text checks cannot establish that verification ran. Version 2 deliberately rejects them. There is no silent migration of historical completion into trusted evidence.

1. Preserve the original plan and handoffs as an archive outside the new plan.
2. Run `init` into a new directory. Copy the old outcomes/cards and rebuild the DAG using the v2 fields above.
3. Convert verification strings into reviewed executable/argument arrays, convert `done` strings into identified acceptance mappings, and choose watch paths and gates.
4. Initialize every imported phase as `{"id":"...","status":"planned"}` in the new ledger. Initialize each gate as open. Remove stale `Current status` declarations from copied cards.
5. Validate, review current code, and verify phases in dependency order. Old handoffs may inform the review but do not replace new runner evidence.

A migration can reverify existing implementation without rewriting it. Keep completed baseline phases' watch scope narrow so normal feature work does not repeatedly invalidate the baseline.

## Programmatic API

```js
import { initPlan, validatePlan, getNextPrompt, startPhase, verifyPhase, completePhase } from 'agentic-phase-gate';
const plan = './Implementation_Plan';
initPlan(plan, { mode: 'light' });
// Configure the generated manifest and actual project checks first.
const validation = validatePlan(plan);
if (!validation.ok) throw new Error(validation.errors.join('\n'));
console.log(getNextPrompt(plan));
startPhase(plan, 'P00', 'engineer-session');
const run = verifyPhase(plan, 'P00', 'engineer-session');
if (!run.passed) throw new Error(run.message);
// Prepare a reviewed handoff, then call completePhase with owner/reviewer/handoff.
```

Mutation APIs are synchronous, including verification. Existing helpers remain exported; workspace resolution now comes from the v2 manifest rather than heuristic detection.
