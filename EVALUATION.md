# Evaluation and evidence

PhaseGate has two distinct evaluation needs: behavioral correctness of the CLI, and effectiveness of the workflow during real feature implementation. Passing the first does not establish the second.

## CLI regression suite

Run `npm test` on the supported Node/OS matrix. The tests use isolated temporary workspaces and verify actual behavior, including:

- No pre-completed baseline or invented scaffold pass.
- Empty/legacy/invalid schemas, cycles, and invalid acceptance mappings are rejected.
- Dependency readiness, blocked phases, and independent branches.
- Captured execution results; nonzero exits, timeouts, missing commands, and incomplete check sets.
- Source stability, current completion fingerprints, historical validity, and declared invalidation.
- Changed evidence artifacts, draft handoffs, reviewer requirements, and external gate ownership.
- Phase claims, locks, checkpoints, releases, descendant reopening, and split rewiring.
- Pending transaction recovery, conflicting edits, source path containment, and CLI exit behavior.

`npm run test:coverage` reports coverage as a diagnostic, not an acceptance target. CI configuration covers Windows/Linux with Node 18/22/24. Record the actual environments run; a configured CI matrix is not a completed test result.

## Real feature benchmark protocol

Use at least three task types: a bounded feature, a cross-layer integration, and a migration or reliability change. Include both greenfield and existing-code tasks where possible. For each task, freeze:

- Repository commit and environment, dependency lockfiles, test data, and service versions.
- User request, independently authored acceptance checks, and risk criteria.
- Model/tool versions, available tools, time/token budget, and reviewer process.

Compare ordinary agent-assisted implementation with PhaseGate under those same conditions. Randomize order and repeat runs; keep failures, timeouts, and interrupted sessions in the dataset. Reviewers should assess the final artifacts against predeclared acceptance without being told which workflow produced them where practical.

Introduce a controlled session interruption in designated runs, then measure whether another session resumes without losing requirements or duplicating completed work. Include a changed dependency or requirement to measure whether stale evidence is detected and correctly revalidated.

## Measures

| Measure | Definition |
| :--- | :--- |
| Accepted completion rate | Runs that satisfy independent acceptance divided by all assigned runs |
| Unsupported completion rate | Runs reported complete while independent acceptance still fails |
| Escaped defects | Defects found after claimed completion within a fixed review/test window |
| Rework | Changes and time needed after the initial completion claim |
| Recovery quality | Requirements retained, duplicate edits, and time to resume after interruption |
| Review effort | Reviewer time to establish acceptance and locate supporting evidence |
| Total cost | Model tokens, tool usage, compute, and human review time per accepted feature |
| Elapsed time | End-to-end task duration, including failed attempts and verification |

Report per-task outcomes, aggregate distributions, sample sizes, and uncertainty. Do not substitute phase counts or documentation volume for delivered behavior. Separate the cost of writing the plan from execution and review, while including all three in total cost.

## Adoption decision

Set thresholds with the team before running the comparison. For example, require a reduction in unsupported completion without an unacceptable increase in review time or total cost. Select thresholds according to project risk and economics, not a universal percentage.

No controlled feature benchmark has been run for this version in this repository. The earlier constant-error, near-zero-hallucination, and fixed-accuracy claims have been removed. Publish measured outcomes and limitations before making effectiveness claims.
