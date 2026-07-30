---
name: presentation
description: Markdown / 手順書からプレゼン資料（PPTX）を生成する
argument-hint: path/to/doc.md [midnight|paper|forest|coral]
---

Generate a polished presentation deck from documentation in this workspace.

1. Resolve the markdown source from the skill arguments (path required). If only a topic is given, find a suitable `.md` with Glob/Grep first.
2. Prefer Tool **GeneratePresentation** with:
   - `path`: workspace-relative markdown path
   - `themeId`: `midnight` (default), `paper`, `forest`, or `coral` if the user specified one
3. Do not invent slide content in Shell or hand-write a PPTX unless GeneratePresentation failed and the user asks for a workaround.
4. After success, report the output path under `.codex/presentation/<slug>/out.pptx`, plus `deck.json` / SVG previews, and any warnings (no OpenAI key → heuristic deck).
5. Quality: one message per slide; never invent code that is not in the source; prefer speaker notes.
6. Prerequisites: optional OpenAI key for Director (heuristic works without it).
