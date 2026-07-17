---
name: security
description: Security-focused review of the codebase or a specific area
argument-hint: optional path or topic (e.g. IPC, shell, secrets)
---

Perform a security review of this workspace.

1. Prioritize: secret leakage, path traversal / workspace escape, command injection, unsafe IPC, XSS in renderer, privilege escalation.
2. Use Read/Grep/Glob to inspect high-risk areas (main process, IPC handlers, shell tools, auth, file I/O).
3. Report findings with severity (Critical / High / Medium / Low), file path, and a concrete remediation.
4. If no issues are found in the scoped area, say so explicitly and note residual risks.
5. Do not invent vulnerabilities; only report what evidence supports.
