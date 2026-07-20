# Security

Report security issues privately through the repository's GitHub Security Advisories. Do not publish vulnerabilities, keys, databases, or user data in an issue.

Local `.env` files, databases, private keys, and the `secrets/` directory are ignored by Git. Use only `.env.example` for documented example values.

Public deployments must use `NODE_ENV=production` behind HTTPS. Keep the environment file outside the repository with restrictive permissions, and never write it to logs or commits.

Store the VPS key and SSH host key as secrets in the GitHub `production` environment, never as repository files or plaintext in the workflow.

Sessions are renewed on every visit and may remain valid for a long time. Users should sign out manually on shared or lost devices.

The public instance rate-limits registrations, sign-in attempts, and recipe writes, and has configurable account and recipe quotas. The operator remains responsible for monitoring, backups, and protection against larger traffic attacks.
