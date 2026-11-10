# Engineering AI-assisted feature development

PhaseGate applies familiar engineering practices?explicit requirements, dependency planning, reproducible verification, and recorded decisions?to coding-agent work. Its purpose is to make implementation and review easier to resume and audit. Its effectiveness should be measured rather than inferred from the size of the documentation or a mathematical analogy.

## Define success before decomposition

Start with a user-visible outcome and acceptance examples. Identify existing behavior, interfaces, failure modes, and production constraints. Prefer a small end-to-end slice that can be independently reviewed. Use separate migration or infrastructure phases only when later work genuinely depends on them.

Each phase should answer:

- What observable behavior changes, and what is explicitly out of scope?
- Which invariants and interfaces must remain compatible?
- What evidence would falsify the claim that this phase is done?
- Which prerequisites, owners, and external inputs affect execution?
- Which source contracts should trigger revalidation if they change later?

## Connect requirements to evidence

The manifest maps identified acceptance criteria to executable checks or named review gates. Automated checks should assert the behavior in question, including relevant failure cases. Review gates cover outcomes requiring human judgment or external authority. Neither a test's existence nor an assertion in a handoff is sufficient on its own.

For example, an invoice endpoint's acceptance might cover:

| Concern | Example criterion | Evidence |
| :--- | :--- | :--- |
| Authorization | Another tenant cannot retrieve the invoice | Negative integration tests at the real authorization boundary |
| Correctness | Downloaded amounts and currency match persisted data | Domain and API assertions |
| Performance | p95 response meets an agreed target at a specified load | Reproducible load test with environment/workload recorded |
| Reliability | Retries do not duplicate side effects | Failure injection and idempotency checks |
| Accessibility | Errors and progress are understandable with assistive tools | Automated checks plus appropriate review |
| Privacy | Sensitive invoice content is absent from application logs | Log assertions or targeted evidence review |
| Recovery | Rollback preserves access and stored data | Migration/rollback rehearsal where applicable |

These are prompts for risk-based planning, not mandatory gates for every change. Small edits should remain small.

## Bound investigation without making it blind

Discovery roots reduce repeated searching and provide a useful start packet. They should not prevent investigation of callers, shared libraries, tests, configuration, or upstream contracts. If following those references reveals a materially larger outcome, update or split the phase before claiming completion.

A task's context budget is a planning heuristic. Choose it based on the model, latency, cost, amount of evidence, and observed reliability. Reserve room for diagnostics and handoff. A fixed 128k budget cannot guarantee accuracy or prevent compaction across different tools and models.

## Separate recorded execution from correctness

The runner captures command execution and input snapshots; completion validates those records. This makes accidental unsupported completion harder, but it does not prove that the chosen tests are adequate. Engineers remain responsible for acceptance coverage, review quality, architectural judgment, and the actual release decision.

Use appropriate test doubles in unit tests, then establish integration and production obligations with suitable evidence. A missing credential or external approval remains a blocker; it is not resolved by a simulated success.

## Treat persistence as engineering work

Durable notes are useful only when they are accurate and recoverable. PhaseGate keeps canonical state in JSON, generates convenience views, records ownership, and journals multi-file transitions. Checkpoints capture discoveries and source fingerprints across sessions. They do not back up uncommitted edits or guarantee recovery after storage loss.

Review changed requirements and dependencies explicitly. Historical verification belongs to the revision it checked. Watch paths and contract hashes identify declared invalidation boundaries; engineers must still assess effects outside them. Final integration checks connect individually completed phases to the behavior of the combined system.

## Scale coordination deliberately

A DAG describes dependencies; it is not a complete concurrent execution strategy. PhaseGate serializes one active phase per plan. Concurrent workers need separate worktrees, clear ownership, interface agreements, and an integration phase after merging. Separate plans editing the same worktree are not coordinated by the CLI.

Split work along reviewable capability boundaries. Prefer existing utilities and ordinary platform mechanisms over new abstractions. A small diff is helpful when it preserves clarity and coverage; line count alone is not a quality metric.

## Evaluate the workflow

Measure independently accepted feature completion, defects, rework, interruption recovery, reviewer time, elapsed time, and token cost. Compare the same repository revisions, tasks, model/tool configurations, and budgets with and without PhaseGate. Record failures and inconclusive runs as well as successes.

The repository's behavioral suite evaluates CLI invariants. It does not demonstrate improved agent accuracy, reduced production defects, or scalable application performance. [EVALUATION.md](EVALUATION.md) specifies a reproducible comparison protocol; no agent-effectiveness benchmark result is claimed yet.
