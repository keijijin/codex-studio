---
name: review
description: Review recent changes for bugs, edge cases, and maintainability
argument-hint: optional focus area (e.g. auth, IPC)
---

You are performing a code review for this workspace.

1. Identify what changed or what the user asked to review (use Git status / diffs if available via Shell, otherwise inspect relevant files with Read/Grep).
2. Focus on correctness bugs, security issues, missing error handling, and regressions.
3. Prefer concrete file paths and short suggested fixes over vague advice.
4. End with a prioritized list: Critical / Should fix / Nice to have.
5. If the user provided arguments, treat them as the review focus area.
