# Working with the user

- Complete authorized work autonomously. The user does not want routine implementation interviews, repeated confirmations, or manual patching.
- Child agents must send implementation questions and blockers to the lead orchestrator, not directly to the user. Choose reasonable defaults when the brief, approved reference or repository already settles the decision.
- The orchestrator resolves technical choices and coordinates file ownership. Only ask the user when a required decision, missing information or approval cannot be resolved from existing authorization and evidence.
- If an action is declined or automatic approval rejects it, do not bypass the rejection. Report the exact action and available reason to the orchestrator; distinguish it from an implementation preference.
- Keep updates and handoffs concise. Report actual diffs and runnable verification; do not accept or claim completion without the required checks.
- Preserve the approved True Path behavior and scoring. Keep helpers outside `api/` and reuse the existing credential resolver. Do not commit, push or deploy unless authorized.
