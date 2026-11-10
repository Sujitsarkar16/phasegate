# PhaseGate architecture

PhaseGate separates phase definitions, execution state, evidence, and derived views. The agent uses a bounded start packet while the repository retains decisions and progress. This is a practical reliability strategy, not a theorem about model accuracy.

## Sources of truth

| Artifact | Responsibility |
| :--- | :--- |
| `phase-manifest.json` | Workspace, policies, phase DAG, acceptance/check mappings, gates, discovery and watch paths |
| `state/STATUS.json` | Canonical execution state, owners, checkpoints, evidence references, gate resolutions, and transition history |
| Phase cards | Context and implementation guidance; do not duplicate mutable status |
| `state/runs/<uuid>/` | Captured commands, exit codes, timestamps, logs, and input fingerprints |
| `state/handoffs/<uuid>.md` | Reviewed handoff copied at completion |
| `state/gate-evidence/<uuid>.txt` | Evidence copied when an accountable owner resolves a gate |
| `state/CURRENT_STATE.md` | Regenerable convenience view; not scheduling authority |

## State and scheduling

Recorded states are `planned`, `in_progress`, `needs_input`, `complete`, and `split`. The CLI derives `ready`, `blocked`, and `stale` from definitions, dependencies, gates, and evidence. A stored `next_phase` hint is not trusted.

Only one phase may be active per plan. A session owner claims it before verification or completion. A filesystem lock serializes each mutating command; an ownership record persists between commands. These controls coordinate cooperative callers of the same plan, not separate plans or arbitrary source editors.

DAG validation rejects unknown dependencies, duplicates, self-dependencies, cycles, and dependencies on replaced split parents. `split` creates a sequential child chain, carries prerequisite gates, preserves review gates on the terminal child, and redirects consumers of the parent to that child. An engineer must review semantic coverage of the parent's acceptance conditions.

## Verification and completion

Commands are structured executable/argument arrays, run with `shell: false` from the declared workspace. Shell execution must be explicitly authored as a command. Validation never executes checks. Execution records include exit status, errors/signals, start/end timestamps, and output log digests; a timeout or missing executable is a failure.

A passing record requires every declared command to finish successfully and the before/after workspace fingerprints to match. Completion checks that the current workspace still matches the recorded snapshot, all acceptance mappings are defined, gates are resolved, and the handoff has been reviewed. A newer failed verification supersedes an older candidate run.

The fingerprint covers file contents and executable bits. In Git worktrees it includes tracked and nonignored untracked files. Without Git, it recursively hashes workspace files. The active plan, `.git`, and `node_modules` are excluded. Symlinks in snapshot inputs are unsupported and cause rejection. Tests should place generated output in the plan's state directory or an appropriate Git-ignored location. The snapshot is not a hermetic build environment.

## Historical validity and change impact

Comparing every previous phase to the latest whole-workspace snapshot would invalidate all history after normal feature work. PhaseGate uses two separate checks:

1. **Before completion:** require the whole-workspace fingerprint from the verification run to remain current.
2. **After completion:** retain the record as historical evidence, while checking the phase definition/card, listed policies, explicit `watch` paths, prerequisite evidence, and gates for changes.

A change to any of those contracts derives `stale`; staleness propagates through dependencies and blocks execution. `reopen` resets the affected phase and descendants while retaining archived evidence and their previous state in history. Newly introduced risks outside declared watches still require a human or agent impact review. A release/integration phase should rerun relevant system-level checks on the final integrated revision.

## Transactions and recovery

A mutation reads the manifest/state under a per-plan exclusive lock, validates its proposed state, and checks that canonical files have not changed meanwhile. It writes a journal containing the expected previous hashes and proposed manifest/state. Each canonical file is replaced through a flushed temporary file and rename. The generated view is refreshed, then the journal is removed.

While a journal exists, ordinary commands fail closed. `recover` can finish either a pending or partly applied transaction, but only when canonical files still match the expected previous or proposed values. It refuses conflicting manual edits. A stale process lock can be cleared automatically only when its recorded process is no longer running on the same host. Unknown/remote lock ownership needs operator reconciliation.

This is a recoverable file transaction, not a database-grade durability guarantee. Filesystem rename/flush behavior and power-loss durability vary. Checkpoints retain notes and fingerprints, not copies of uncommitted edits. Keep normal Git commits and backups. An interrupted verifier may leave orphaned evidence files; they are not completion evidence unless a committed state references them.

## Trust boundaries and limits

The CLI validates local records; it is not a sandbox or identity provider. Repository-defined programs execute with the caller's permissions. Owner labels and reviewer names are assertions by the caller. Hashes detect inconsistent artifact edits but do not stop someone with write access from replacing a record and its digest.

For stronger assurance, run verification in trusted CI, protect the canonical branch and evidence archive, authenticate reviewers through the hosting platform, and control release credentials. A check exiting zero proves execution success, not test adequacy, statutory compliance, or absence of defects. External inputs, ignored configuration, runtime versions, and child processes need project-specific controls. A timed-out command is rejected; scripts that launch background children must also manage their teardown.

There is no claim of constant error probability, near-zero hallucinations, guaranteed context retention, or a universal optimal token budget. See [EVALUATION.md](EVALUATION.md) for how to measure whether the workflow helps in practice.
