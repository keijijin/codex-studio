# Codex Studio

Cursor のような AI ネイティブ開発環境（AI Agent IDE）です。

## クイックスタート

```bash
pnpm install
pnpm dev
```

## 現在の実装状況（Sprint 6 / 安定化 + 配布準備）

- [x] pnpm monorepo + Electron + Monaco + 型安全 IPC
- [x] ワークスペース + 索引 + ripgrep 検索
- [x] **chokidar ファイルウォッチャー** + 索引増分更新
- [x] OpenAI / Anthropic / **Ollama** チャット + Agent モード
- [x] Agent ツール（Read / Grep / Glob / Write / StrReplace / Delete / Shell）
- [x] 承認ダイアログ + Diff + YOLO モード設定
- [x] `.md` プレビュー / 編集切替
- [x] **組み込みターミナル**（node-pty + xterm）
- [x] **XML / Java シンタックスハイライト**
- [x] 最近開いたワークスペース
- [x] Playwright E2E（起動・ワークスペース・チャット・ターミナル）
- [x] electron-builder（macOS / Windows / Linux）
- [x] **GitHub Releases 自動化**（tag push）
- [x] [ユーザーガイド](./docs/user/guide.md) / [セキュリティチェックリスト](./docs/security-checklist.md) / [リリース手順](./docs/release.md)

**リポジトリ**: https://github.com/keijijin/codex-studio

## コマンド

```bash
pnpm dev          # 開発サーバー
pnpm build        # ビルド
pnpm test         # ユニットテスト
pnpm test:e2e     # E2E（ビルド後 Playwright）
pnpm package:mac    # macOS .dmg
pnpm package:win    # Windows インストーラー
pnpm package:linux  # Linux AppImage + .deb
pnpm typecheck
```

## リリース

`v*` 形式の tag を push すると GitHub Actions が各 OS 向けインストーラをビルドし、Releases に公開します。詳細は [docs/release.md](./docs/release.md)。

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
