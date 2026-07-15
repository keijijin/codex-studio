# ToDo リスト：Codex Studio

| 項目 | 内容 |
|------|------|
| 版 | 1.0 |
| 作成日 | 2026-07-15 |
| 更新日 | 2026-07-15（Sprint 6 同期） |

> ステータス: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 / `[-]` キャンセル

---

## Phase 0: 基盤構築（Week 1-2）

### リポジトリ・環境

- [x] GitHub リポジトリ作成（Public: keijijin/codex-studio）
- [x] pnpm monorepo 初期化
- [x] `packages/` 構成作成（app, renderer, shared）
- [x] TypeScript 設定（各パッケージ tsconfig）
- [x] ESLint + Prettier 設定
- [ ] lint-staged + husky pre-commit
- [x] `.gitignore` / `.env.example` 作成

### Electron 基盤

- [x] electron-vite セットアップ
- [x] Main Process エントリ（`packages/app`）
- [x] Renderer エントリ（`packages/renderer`）
- [x] Preload スクリプト + contextBridge
- [x] 開発時 HMR 動作確認
- [x] `pnpm dev` / `pnpm build` スクリプト

### CI/CD

- [x] GitHub Actions: lint job
- [x] GitHub Actions: typecheck job
- [x] GitHub Actions: test job
- [x] GitHub Actions: build job（main branch）
- [ ] Branch protection ルール設定

### ドキュメント

- [x] 企画書作成
- [x] 仕様書作成
- [x] アーキテクチャ定義書作成
- [x] 設計書作成
- [x] 開発プラン作成
- [x] WBS 作成
- [x] ToDo リスト作成
- [ ] CONTRIBUTING.md 作成
- [x] README.md（セットアップ手順）作成

---

## Phase 1: エディタ + ワークスペース（Week 3-4）

### Main Process

- [x] IPC 型定義（`packages/shared/src/ipc.ts`）
- [x] IPC Router 実装
- [x] ワークスペース open handler
- [x] ワークスペース close handler
- [x] ファイル read handler
- [x] ファイル write handler
- [x] ファイルツリー生成 API
- [x] chokidar ファイルウォッチャー
- [ ] .gitignore パーサー統合

### Renderer UI

- [x] Tailwind CSS セットアップ
- [x] ダークテーマ CSS 変数定義
- [x] Layout シェルコンポーネント
- [x] ActivityBar コンポーネント
- [x] Sidebar コンポーネント
- [x] Explorer（ファイルツリー）コンポーネント
- [x] Monaco Editor 統合
- [x] TabBar コンポーネント
- [x] StatusBar コンポーネント
- [x] ウェルカム画面（フォルダ選択）
- [x] 最近のワークスペース一覧

### 設定

- [x] AppSettings 型定義
- [x] 設定ファイル読み書き（Main）
- [x] 設定画面 UI（基本項目）

---

## Phase 2: 索引 + チャット（Week 5-6）

### 索引

- [ ] SQLite 初期化（better-sqlite3）— Post-MVP
- [ ] index.db スキーマ作成 — Post-MVP
- [x] Index Service 初回スキャン（インメモリ）
- [ ] Index Worker Thread
- [ ] FileWatcher → 増分索引連携
- [x] ripgrep 検索ラッパー
- [x] 索引ステータス IPC
- [x] SearchPanel UI

### セッション・DB

- [ ] sessions.db スキーマ作成 — Post-MVP（現状 electron-store）
- [x] Session Repository（electron-store）
- [x] Message Repository（electron-store）
- [ ] Migration 仕組み

### LLM

- [x] LLMProvider インターフェース
- [x] OpenAI Adapter（chat + stream）
- [ ] トークンカウント（tiktoken or 近似）
- [ ] API キー Keychain 保存（現状 electron-store / env）

### チャット UI

- [x] AIPanel レイアウト
- [x] SessionList コンポーネント
- [x] ChatInput コンポーネント
- [x] MessageList コンポーネント
- [x] UserMessage / AssistantMessage
- [x] ストリーミング表示
- [x] Markdown レンダリング（react-markdown）
- [ ] コードブロック HL
- [x] @file オートコンプリート
- [x] モデル選択（Settings 画面）

---

## Phase 3: Agent + ツール（Week 7-10）

### Agent コア

- [ ] AgentConfig 型
- [ ] AgentOrchestrator 実装
- [ ] Agent Worker Thread 分離
- [ ] ストリームイベント発行
- [ ] maxIterations 制御
- [ ] Cancel（AbortSignal）対応
- [ ] Tool Registry 基盤
- [ ] Context Builder 実装
- [ ] トークン予算 trim ロジック
- [ ] Rules Loader（.codex/rules/）

### ツール

- [ ] Tool インターフェース
- [ ] resolveWithinWorkspace ユーティリティ
- [ ] Read Tool
- [ ] Write Tool + バックアップ
- [ ] StrReplace Tool
- [ ] Delete Tool
- [ ] Grep Tool
- [ ] Glob Tool
- [ ] Shell Tool（node-pty）
- [ ] Shell denylist 設定
- [ ] ツールスキーマ（OpenAI function 形式）

### LLM 追加

- [ ] Anthropic Adapter
- [ ] Ollama Adapter
- [ ] Tool calling 対応（各 Adapter）

### Agent UI

- [ ] Agent / Ask モード切替
- [ ] ToolCallCard コンポーネント
- [ ] ToolLog パネル
- [ ] ApprovalDialog コンポーネント
- [ ] DiffEditor コンポーネント
- [ ] Apply / Reject ボタン

---

## Phase 4: 仕上げ + リリース（Week 11-12）

### テスト

- [ ] agent-core ユニットテスト
- [ ] tools ユニットテスト
- [ ] Context Builder テスト
- [ ] IPC 統合テスト
- [ ] Playwright E2E: ワークスペース open
- [ ] Playwright E2E: チャット送信
- [ ] Playwright E2E: Agent タスク完遂
- [ ] Agent ベンチマーク 20 件作成
- [ ] ベンチマーク自動実行スクリプト

### セキュリティ

- [ ] IPC 入力検証
- [ ] CSP ヘッダー設定
- [ ] シークレットパターン検出
- [ ] 監査ログ（JSONL）
- [ ] セキュリティレビュー実施

### パフォーマンス

- [ ] 起動時間プロファイリング
- [ ] 索引パフォーマンス計測（10万ファイル）
- [ ] メモリリークチェック

### パッケージング

- [x] electron-builder 設定
- [x] macOS .dmg ビルド
- [ ] macOS 公証
- [~] Windows .exe ビルド（CI: node-pty / MSVC 修正中）
- [x] Linux AppImage ビルド
- [x] GitHub Releases 自動化
- [ ] electron-updater 設定

### リリース

- [ ] ユーザーガイド（docs/user/）
- [x] α テスト計画書
- [~] 社内 α 配布（10名）— mac/Linux ビルド配布可能
- [ ] フィードバック収集
- [ ] 重大バグ修正
- [~] α リリース判定（v0.1.0 公開済み、Windows 待ち）

---

## Post-MVP バックログ

### MCP 連携

- [ ] MCP Client パッケージ（`packages/mcp-client`）
- [ ] stdio トランスポート
- [ ] SSE トランスポート
- [ ] MCP ツール → Tool Registry 統合
- [ ] MCP 設定 UI

### Tab 補完

- [ ] Inline completion Provider
- [ ] コンテキスト収集（周辺行、LSP）
- [ ] デバウンス + キャンセル
- [ ] Ghost text UI

### セマンティック検索

- [ ] Embedding 生成（ファイル chunk）
- [ ] ベクトルストア（sqlite-vss or hnswlib）
- [ ] 類似度検索 API
- [ ] @codebase semantic モード

### クラウド Agent

- [ ] API Gateway 設計
- [ ] VM プロビジョニング
- [ ] ワークスペース sync
- [ ] リモート Agent Worker

### エンタープライズ

- [ ] SSO 連携
- [ ] チーム Rules 共有
- [ ] Admin Console
- [ ] 集中監査ログ

---

## 進捗サマリー（2026-07-15 時点）

| Phase | 状態 | 備考 |
|-------|------|------|
| Phase 0 基盤 | ほぼ完了 | husky / CONTRIBUTING 残 |
| Phase 1 エディタ | ほぼ完了 | ウォッチャー完了 |
| Phase 2 索引+チャット | ほぼ完了 | SQLite は Post-MVP |
| Phase 3 Agent+ツール | 完了 | Worker Thread 分離は未 |
| Phase 4 リリース | 進行中 | v0.1.0 公開（mac/Linux）、Windows CI 修正中 |

> 詳細は [README.md](../README.md) の Sprint 6 セクションを参照

---

## 今週のフォーカス（Week 1）

1. Monorepo + Electron 起動
2. CI パイプライン
3. IPC 基盤の型定義
4. README / CONTRIBUTING

---

## メモ・決定事項

| 日付 | 内容 |
|------|------|
| 2026-07-15 | プロジェクト名「Codex Studio（仮称）」で文書一式作成 |
| | Electron + React + Monaco で MVP 構築方針決定 |
| | MCP / Tab 補完は Post-MVP に延期 |
