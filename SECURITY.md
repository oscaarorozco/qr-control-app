# Security Policy

## Supported versions

Security updates are provided for the latest main branch.

## Reporting a vulnerability

Please do not disclose vulnerabilities publicly first.

Send a private report including:

- Affected endpoint or module
- Reproduction steps
- Impact assessment
- Suggested mitigation (optional)

Until a dedicated security contact is configured in repository settings, open an issue with minimal details and request private contact to continue disclosure.

## Hardening checklist

- Use a strong `JWT_SECRET` (32+ chars).
- Never commit `.env.local`.
- Never commit real SQLite data files.
- Use HTTPS in production.
- Rotate admin credentials after first deployment.
