# Your first PhaseGate workflow

Phases, gates, evidence, and handoffs can feel unfamiliar when you are starting out. This walkthrough uses a tiny greeting function so you can learn the workflow before applying it to a larger feature.

You need Node.js 18+ and Git. Run every command below from the repository root in PowerShell, Bash, or a similar terminal. No API key or AI subscription is needed.

## 1. Get the project

```sh
git clone https://github.com/Sujitsarkar16/phasegate.git
cd phasegate
npm run demo:init
```

The demo initializer creates `examples/beginner-demo/Implementation_Plan`. It configures a single phase, `P00`, to verify the included greeting function. Nothing is marked complete. It refuses to overwrite an existing nonempty plan, so run it once.

Read [greeting.js](examples/beginner-demo/greeting.js) and [greeting.test.js](examples/beginner-demo/greeting.test.js). The function already works: this first exercise teaches how to verify and record existing behavior.

## 2. Understand the plan

```sh
node bin/phasegate.js validate examples/beginner-demo/Implementation_Plan
node bin/phasegate.js next examples/beginner-demo/Implementation_Plan
```

`validate` checks the plan structure; it does not run tests. `next` explains which phase is ready and provides context for an engineer or coding agent.

The generated `phase-manifest.json` describes:

| Field | Plain meaning |
| :--- | :--- |
| `objective` | The outcome you want |
| `read` | Files to inspect first |
| `watch` | Source contracts whose later changes should invalidate completion |
| `done` | Observable acceptance criteria |
| `verify` | Programs that check those criteria |
| `depends_on` | Earlier phases that must be complete and current |

The demo checks two outcomes: named developers get a trimmed greeting, and blank or missing names receive `Hello, developer!`. Its verification command runs Node's test runner against those assertions.

## 3. Start the phase

```sh
node bin/phasegate.js start P00 examples/beginner-demo/Implementation_Plan --owner my-first-session
```

`start` claims a ready phase. Keep the same owner label for the following commands. The label records responsibility; it is not a login or authentication mechanism.

In your own project, this is where you implement the outcome. In this demo, inspect the greeting and tests before continuing.

## 4. Run verification

```sh
node bin/phasegate.js verify P00 examples/beginner-demo/Implementation_Plan --owner my-first-session
```

PhaseGate executes the declared check, saves its result and logs, and checks that source inputs stayed stable. The included greeting tests should pass. Test results are stored in the plan's `state/runs` directory.

Passing verification does not complete the phase. You still need to review what the tests cover and leave a handoff. If you edit source after verification, run verification again before completing.

## 5. Write and review the handoff

```sh
node bin/phasegate.js handoff P00 examples/beginner-demo/Implementation_Plan
```

Open `examples/beginner-demo/Implementation_Plan/state/drafts/P00.md` in your editor. Fill its sections with what you actually inspected and observed. For example, describe the named greeting and fallback assertions, state that the function was already implemented, reference the passing run, record your Node version, and note that this is only a local greeting demo.

Review the code and assertions. Record any limitations and what the next developer needs. Then remove the line `<!-- phasegate:draft -->` and the template prompts. A copied template is not a review.

Self-review is sufficient for learning this demo. A real project may require an independent reviewer or a named review gate.

## 6. Complete and check status

```sh
node bin/phasegate.js complete P00 examples/beginner-demo/Implementation_Plan --owner my-first-session --reviewer your-name --handoff examples/beginner-demo/Implementation_Plan/state/drafts/P00.md
node bin/phasegate.js status examples/beginner-demo/Implementation_Plan
```

Replace `your-name` with the actual reviewer label. Completion checks current evidence, acceptance mappings, applicable gates, and the reviewed handoff, then archives the handoff. Status should show the single phase as complete.

## Common points of confusion

| What happened? | What to do |
| :--- | :--- |
| A fresh project scaffold fails verification | Replace its placeholder command with real tests; this is intentional |
| Validation passes but no tests have run | Run `verify`; validation checks structure only |
| Completion says evidence is stale | Inspect the change and verify the current source again |
| Completion rejects the draft | Fill, review, and remove the draft marker from the handoff |
| Another owner holds the phase | Coordinate a checkpoint and release before transferring it |
| A gate blocks progress | Obtain the actual required evidence from its accountable owner |

A **gate** is a required prerequisite or review backed by evidence, such as approval of an accessible error screen. The first demo has no gates so you can learn the basic sequence first.

## Move to your own feature

Create a light-mode plan in your project's workspace with `init --mode light`. Unlike the configured demo, a normal scaffold deliberately contains a failing placeholder. Replace its source paths, acceptance criteria, and verification commands before using the same sequence:

**Define → start → implement → verify → review handoff → complete.**

Choose a small observable outcome, such as validating a form field or adding one API behavior. Read [HOW_IT_WORKS.md](HOW_IT_WORKS.md) for larger features and [CLI_GUIDE.md](CLI_GUIDE.md) for exact manifest and command details.

Found a confusing step? Open a [documentation request](https://github.com/Sujitsarkar16/phasegate/issues/new/choose) and describe where you got stuck. Beginner feedback helps improve the workflow for everyone.
