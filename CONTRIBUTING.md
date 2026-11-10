# Contributing to PhaseGate

Help make AI-assisted development easier to understand and easier to review. Documentation fixes, examples, reproducible bug reports, and focused code changes are welcome.

New to the workflow? Start with [the beginner guide](BEGINNER_GUIDE.md). An unclear instruction is a useful contribution opportunity.

## Run locally

Requires Node.js 18+ and Git. There are no runtime dependencies to install.

```sh
git clone https://github.com/Sujitsarkar16/phasegate.git
cd phasegate
npm test
```

Fork the repository and create a branch for your change. Keep pull requests focused on one problem. Describe the previous behavior, the new behavior, and how you checked it. Include regression coverage when changing evidence, ownership, gates, snapshots, recovery, or path handling.

Before opening a pull request:

```sh
npm test
npm pack --dry-run
```

For coverage details, run `npm run test:coverage`. CI runs on Linux and Windows with Node 18, 22, and 24.

## Where to contribute

- Improve instructions that assume prior knowledge of phase workflows.
- Add small examples with observable acceptance criteria and real checks.
- Report failures with the command, Node/OS version, expected behavior, and a minimal reproduction.
- Discuss substantial schema or lifecycle changes in an issue before implementing them.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before modifying guarantees. Preserve the rule that a generated scaffold is unverified and cannot supply passing evidence by itself. Owner and reviewer labels do not authenticate people; avoid claims that hashes alone make evidence tamper-proof.

Do not include credentials, private source, or sensitive verification logs in issues or pull requests. For a security concern, follow [SECURITY.md](SECURITY.md).

Be respectful, explain your reasoning, and help newcomers ask questions. Contributions are licensed under the project's [MIT license](LICENSE).
