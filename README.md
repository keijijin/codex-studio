# Codex Studio

Cursor のような AI ネイティブ開発環境（AI Agent IDE）です。

## クイックスタート

```bash
pnpm install
pnpm dev
```

## 現在の実装状況（Sprint 5 / α リリース準備）

- [x] pnpm monorepo + Electron + Monaco + 型安全 IPC
- [x] ワークスペース + 索引 + ripgrep 検索
- [x] OpenAI / Anthropic / **Ollama** チャット + Agent モード
- [x] Agent ツール（Read / Grep / Glob / Write / StrReplace / Delete / Shell）
- [x] 承認ダイアログ + Diff + YOLO モード設定
- [x] `.md` プレビュー / 編集切替
- [x] 最近開いたワークスペース
- [x] Playwright E2E（起動・ワークスペース）
- [x] electron-builder（macOS / Windows / Linux）
- [x] [ユーザーガイド](./docs/user/guide.md) / [セキュリティチェックリスト](./docs/security-checklist.md)

## コマンド

```bash
pnpm dev          # 開発サーバー
pnpm build        # ビルド
pnpm test         # ユニットテスト
pnpm test:e2e     # E2E（ビルド後 Playwright）
pnpm package:mac  # macOS .dmg
pnpm package:win  # Windows インストーラー
pnpm typecheck
```

## LLM 設定

| プロバイダ | 設定方法 |
|-----------|----------|
| OpenAI | 設定画面で API キー |
| Anthropic | 設定画面で API キー |
| Ollama | Base URL（既定 `http://localhost:11434`）+ ローカルモデル |

## プロジェクト構成

```
packages/
├── app/           # Electron Main + IPC
├── renderer/      # React UI
├── shared/        # 型・IPC
├── indexer/       # 索引・ripgrep
├── llm-adapters/  # OpenAI / Anthropic / Ollama
├── tools/         # Agent ツール
└── agent-core/    # Orchestrator
```

## ドキュメント

| 文書 | パス |
|------|------|
| ユーザーガイド | [docs/user/guide.md](./docs/user/guide.md) |
| セキュリティ | [docs/security-checklist.md](./docs/security-checklist.md) |
| アーキテクチャ | [docs/03-アーキテクチャ定義書.md](./docs/03-アーキテクチャ定義書.md) |

## 技術スタック

Electron 35 · React 19 · TypeScript 5 · Monaco · Tailwind · Zustand · Vitest · Playwright

## ライセンス

TBD
