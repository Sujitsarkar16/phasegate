# Implementing a feature with PhaseGate

A useful phase establishes observable behavior, records how that behavior was checked, and leaves enough context for the next engineer. Use the smallest process that keeps those obligations clear.

## 1. Ground the feature in the repository

Inspect existing behavior, interfaces, data contracts, tests, and repository instructions. Identify the user outcome and risks before choosing phases. For an invoice download feature, acceptance might include tenant isolation, expired links, accessible failures, and an appropriate response-time target under a stated workload.

For a small change, use `init --mode light` and configure its single phase. For a larger feature, use standard mode, configure P00 as a baseline, and replace P01 with useful feature slices. The scaffold's checks intentionally fail. It never marks a baseline complete merely because files were generated.

A typical decomposition is:

| Phase | Observable outcome | Useful verification |
| :--- | :--- | :--- |
| Baseline | Existing behavior and relevant checks are understood | Current project tests; documented pre-existing failures |
| First usable slice | Authorized users can download an invoice end to end | Authorization, API, and UI integration checks |
| Failure and scale behavior | Errors, concurrency, and workload targets behave as specified | Adversarial cases, accessibility review, load/recovery checks |
| Release, when needed | The integrated revision is deployable and recoverable | Migration compatibility, observability, rollback, external approvals |

Do not mechanically split every feature into database, backend, API, and UI phases. Use technical-layer phases when they represent real dependencies; otherwise an end-to-end slice exposes integration mistakes sooner.

## 2. Make acceptance reviewable

Each `done` entry has an ID, an observable condition, and either check IDs or a named review gate. Define the workload, environment, and thresholds for performance criteria. Define authorization boundaries and sensitive-data behavior for security criteria. Record why a nonfunctional concern is out of scope when that decision matters.

A passing test command is evidence about what that command checks. Review coverage and assertion quality. A generic build command alone is usually insufficient evidence for a user-facing feature.

Discovery roots are starting points. Follow relevant callers, schemas, tests, and dependencies; record material scope expansion before verifying. `watch` paths identify contracts whose later changes should invalidate historical completion. Watch lockfiles and configuration when relevant. Empty watch lists are allowed for historical baselines, with a validation note and an explicit impact-review obligation.

## 3. Execute and record

Use the CLI to claim the phase, implement it, and record checkpoints. Before `verify`, inspect the declared programs and their side effects. They run with your permissions and can perform real operations.

The runner stores one unique directory per run with commands, log digests, timestamps, exit codes, and code fingerprints. Failed checks stop the run and cannot authorize completion. Checks that modify nonignored source fail the stability requirement; finish generation/build preparation first or use appropriate ignored output paths, then verify stable inputs.

Prepare the handoff draft inside the plan. Review the diff, acceptance coverage, relevant environment, unresolved risks, and rollback. Remove the draft marker only after filling it. `complete` requires the active owner, recorded reviewer, current passing evidence, resolved gates, and nonempty handoff. The CLI archives the handoff under a new name instead of modifying the draft into a purported historical record.

## 4. Handle missing inputs

Prerequisite gates in `phase.gates` block starting a phase. Completion review gates in `done[].gate` allow implementation to proceed while blocking completion.

If an unexpected input is missing mid-phase, use `block` with a concrete reason. The claim is released and independent ready branches become eligible. Record the missing input, responsible person, and unblocking condition in the phase context. `unblock` records a resolution, then readiness is recomputed; it does not bypass unresolved gates.

Mocks are appropriate for isolated tests. A mock of an unavailable external system does not establish that the real integration or production prerequisite works.

## 5. Resume and revise

On a new session, read status, the card/definition, the latest checkpoint, and relevant prerequisite handoffs. Inspect existing edits before deciding what remains. Checkpoints preserve notes and a fingerprint, not source backups. Use Git commits and normal backups for source durability.

A failed process may leave a command lock or transaction journal. `recover` finishes a safely identifiable pending transaction or clears a dead local process lock. It refuses live/remote locks and conflicting edits. A phase claim is separate from the short-lived command lock: coordinate `release` before changing the owner label.

When requirements, watched contracts, policies, or upstream evidence change, completed phases may become stale. `reopen` the affected phase and descendants, record the reason, and reverify current behavior. Existing code may already satisfy the revised requirement; reopening does not mean rewriting it.

For a scope split, checkpoint current code and findings, author child cards/definitions, and invoke `split`. It creates a sequential chain and rewires downstream dependencies transactionally. Review semantic acceptance coverage. The CLI preserves named parent review gates, but it cannot infer that rewritten tests still prove every parent requirement.

## 6. Integrate and release

Use separate worktrees and plans for concurrent workers. The per-plan lock does not prevent two different plans from editing the same source. Review branch changes, resolve conflicts, and run an integration/release phase on the combined revision.

For stronger release assurance, run the exact checks in trusted CI, protect merge/release permissions, and use the platform's authenticated review records. Local labels and hashes do not provide identity or tamper-proof attestation. External services, legal approvals, credentials, and runtime environments need their actual accountable owners.

## Failure recovery examples

| Situation | Expected action |
| :--- | :--- |
| Check exits nonzero or times out | Inspect its captured log; diagnose; run verification again |
| Source changes after a passing run | Reverify before completion |
| Watched contract or policy changes after completion | Inspect affected phases; reopen and reverify |
| Another owner holds a phase | Coordinate a checkpoint/release; use a new claim |
| Process dies while writing state | Run recover; preserve files if it reports a conflict |
| Phase grows beyond a cohesive outcome | Split with child acceptance definitions and review coverage |
| Gate evidence is revoked or changes | Close/re-resolve the gate; revalidate consumers |

See [CLI_GUIDE.md](CLI_GUIDE.md) for exact commands and [EVALUATION.md](EVALUATION.md) for measuring outcomes.
