# Security

PhaseGate executes the verification programs declared in a plan with the caller's permissions. Inspect a plan and its commands before running it, especially when working with unfamiliar repositories.

Evidence logs may contain everything those programs print. Keep credentials and private data out of commands, logs, and handoffs. Local digests detect changes; they are not signatures or identity checks. Use trusted CI and authenticated review for release assurance.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option to send a private report. Include the affected revision, a minimal reproduction, impact, and any proposed mitigation. Do not publish exploit details or secrets in a public issue.

For ordinary bugs without sensitive impact, use [GitHub Issues](https://github.com/Sujitsarkar16/phasegate/issues).
