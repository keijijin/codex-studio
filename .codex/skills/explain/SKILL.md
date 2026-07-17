---
name: explain
description: Explain how a file, module, or flow works in plain language
argument-hint: path or topic to explain
---

Explain the requested part of this codebase clearly.

1. If a path or symbol is given in the arguments, start there with Read/Grep.
2. Summarize purpose, key entry points, data flow, and important side effects.
3. Call out non-obvious invariants or gotchas.
4. Keep the explanation structured (Overview → Flow → Details → Tips).
5. Prefer diagrams in mermaid or short bullet lists when helpful.
