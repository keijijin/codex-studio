---
name: video-tutorial
description: Markdown / 手順書から解説動画（MP4）を生成する
argument-hint: path/to/doc.md [hybrid|slides|generative]
---

Generate a short tutorial video from documentation in this workspace.

1. Resolve the markdown source from the skill arguments (path required). If only a topic is given, find a suitable `.md` with Glob/Grep first.
2. Prefer Tool **GenerateVideo** with:
   - `path`: workspace-relative markdown path
   - `mode`: `hybrid` (default), `slides`, or `generative` if the user specified one
3. Do not invent a long custom ffmpeg pipeline in Shell unless GenerateVideo failed and the user asks for a workaround.
4. After success, report the output path under `.codex/video/<slug>/out.mp4` and any warnings (missing Runway key → slides fallback, etc.).
5. Prerequisites reminders if the tool fails: `ffmpeg` on PATH (or `FFMPEG_PATH`), OpenAI key for Director/TTS, optional Runway key (`RUNWAYML_API_SECRET` or settings).
