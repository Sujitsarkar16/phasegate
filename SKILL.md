---
name: agentic-phase-gate
description: Plan, execute, and resume multi-session software features using bounded phase cards, dependency-aware state, recorded verification, and reviewed handoffs. Use for substantial implementation plans or existing PhaseGate plans.
---

# Agentic Phase-Gate

Use the repository as durable working memory. Keep each phase focused on an observable outcome and use the CLI to record execution state. This workflow supports the user's requested scope; it does not authorize deployment, external communications, purchases, or other actions beyond that scope.

Read [CLI_GUIDE.md](CLI_GUIDE.md) for commands and schema details. Read [HOW_IT_WORKS.md](HOW_IT_WORKS.md) when authoring a plan, splitting work, or recovering a session. The package needs Node.js 18 or newer and has no runtime dependencies.

## Choose the amount of process

- For a small, cohesive change, use light mode: one phase, concrete criteria, real verification, and a handoff. Do not add release bureaucracy to routine edits.
- For work spanning sessions or independent capabilities, use standard mode with a verified baseline and end-to-end feature slices. Add release gates only where relevant.
- Keep the current project conventions and the user's established authorization. Do not require a fresh approval merely to continue already authorized implementation.

## Author a grounded plan

1. Inspect repository instructions, actual architecture, existing behavior, and available test commands. Reuse existing implementation where appropriate.
2. Initialize a plan under the workspace using `phasegate init <dir> --mode light|standard`. The scaffold is deliberately unverified and its placeholder checks fail.
3. Replace scaffold outcomes and checks. Each phase needs observable acceptance criteria mapped to check IDs or a named review gate. Prefer a thin end-to-end capability when this exposes integration risks early. Infrastructure or migration phases are appropriate when they are genuine prerequisites.
4. List dependency IDs, relevant `read` starting points, and `watch` paths for contracts whose later changes should invalidate completion. Watch concrete files/directories, including tests and configuration where material; these are not glob patterns. Avoid watching the whole workspace unless broad revalidation is intended.
5. Add applicable nonfunctional acceptance: authorization/privacy, performance under a stated workload, resilience, accessibility, telemetry, migration compatibility, and rollback. Record measurable thresholds and how they will be checked.
6. Add named external gates with accountable owners and evidence requirements. Put gates needed to begin work in `phase.gates`; put review gates needed only for completion in acceptance criteria.
7. Use a context budget appropriate to the model, task, cost, and session. It is a planning estimate, not a measured token limit or accuracy guarantee.
8. Run `phasegate validate <dir>` and inspect `phasegate next <dir>`. Validation does not execute verification commands or certify that tests are sufficient.

## Execute a phase

1. Read `phasegate status`, the active phase definition and card, relevant policies, latest checkpoint, and prerequisite handoffs. Treat chat history as supplementary.
2. Claim eligible work with `phasegate start <id> <dir> --owner <session-owner>`. Do not take over another owner's phase without coordinating a release. Use separate worktrees and plans for concurrent workers.
3. Inspect the listed discovery roots, then follow relevant callers, tests, schemas, and dependencies as needed. Roots are starting points, not a read whitelist. Record material scope changes and update the phase before verification.
4. Confirm the baseline and implement the bounded outcome. Tests may use appropriate doubles; production or external acceptance needs suitable integration evidence or an accountable review gate.
5. Checkpoint consequential discoveries and unfinished work during long phases. Checkpoints preserve notes and a code fingerprint, not uncommitted source backups; use normal Git practices to preserve edits.
6. Review the exact `verify` command/argument arrays and their side effects. `phasegate verify <id> <dir> --owner <owner>` executes them in the workspace, records outputs and exit codes, and rejects unstable input snapshots. Diagnose failures before rerunning. Do not weaken acceptance to obtain a pass.
7. Prepare a draft with `phasegate handoff`. Review the diff, acceptance coverage, environment, risks, and rollback. Fill the handoff and remove its draft marker. Record who performed the review; use an independent reviewer for consequential changes when required by project policy. Do not invent reviewer identity or external sign-off.
8. Resolve completion gates with actual evidence, then run `phasegate complete <id> <dir> --owner <owner> --reviewer <reviewer> --handoff <file>`. Do not edit `STATUS.json` to declare completion. Finish by checking `phasegate validate` and reporting the concrete outcome and remaining limitations.

## Adapt and recover

- Missing input: `block` records a reason; eligible independent branches can proceed. `unblock` records the resolution but does not bypass unresolved prerequisite gates.
- Changed requirements or stale evidence: inspect the impact, then `reopen` the affected phase. This resets its descendants and preserves old evidence. Reverify the reopened phases.
- Oversized phase: checkpoint current work, create child cards and complete definitions, then use `split`. It creates a sequential child chain, preserves prerequisite and review gates, and rewires downstream dependencies. Review that the children cover every original acceptance condition. It does not roll back existing code.
- Interrupted command: use `recover` to finish a pending transaction or clear a demonstrably dead local process lock. It refuses live locks and conflicting manual edits. An abandoned phase claim requires a recorded `release` using its existing owner label before a new claim.
- During a phase, source changes after verification require another run. Historical completion remains valid until a declared watch path, phase contract, policy, prerequisite evidence, or gate changes. Changes outside those declarations still need an engineering impact review.

## Evidence boundaries

The CLI checks recorded execution, input fingerprints, dependencies, and artifact integrity. It cannot establish that arbitrary tests prove a feature correct. Local owner labels are not authentication, hashes are not signatures, and a user with write access can forge local records. For production assurance, execute gates in trusted CI and protect review and release permissions. Never claim zero hallucinations, guaranteed recovery from storage loss, or a fixed accuracy percentage from this workflow.
