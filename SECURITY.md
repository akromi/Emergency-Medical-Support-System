# Security Policy

> ⚠️ TRIAGE-LINK is a **prototype — not a medical device and not for clinical
> use.** Do not put real protected health information (PHI) into a deployment
> that has not completed the production-hardening described in
> `docs/MASTER-ARCHITECTURE.md` (§10 Security & privacy).

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Use **GitHub → Security → Report a vulnerability** (private advisory) on this
  repository, or
- email the maintainer.

Include enough detail to reproduce: affected component (field client, sync
service, or EHR gateway), version/commit, impact, and a proof of concept if you
have one. We aim to acknowledge within a few business days.

Please give us a reasonable window to remediate before any public disclosure.

## Scope

In scope: the PWA (`src/`), the framework-free core (`packages/core`), the sync
service (`packages/sync-service`), and the EHR gateway (`packages/ehr-gateway`).

Out of scope: third-party hosting platforms, and findings that require a
already-compromised device or a modified build.

## Automated checks

This repository runs, on every pull request:

- **`npm audit`** (fails CI on a high/critical advisory),
- **CodeQL** static analysis (`security-extended`),
- **gitleaks** secret scanning (full history),
- **Dependabot** weekly updates for npm and GitHub Actions.

GitHub Actions workflows run with least-privilege `permissions:` blocks.
