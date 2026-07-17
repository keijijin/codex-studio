# ToDo リスト：Codex Studio

| 項目 | 内容 |
|------|------|
| 版 | 1.0 |
| 作成日 | 2026-07-15 |
| 更新日 | 2026-07-17（エージェント拡張 Phase A〜D 追加） |

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
- [x] Rules Loader（.codex/rules + .cursor/rules + global + UI）

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
- [x] Windows .exe ビルド
- [x] Linux AppImage ビルド
- [x] GitHub Releases 自動化
- [ ] electron-updater 設定

### リリース

- [ ] ユーザーガイド（docs/user/）
- [x] α テスト計画書
- [~] 社内 α 配布（10名）— 全 OS ビルド配布可能
- [ ] フィードバック収集
- [ ] 重大バグ修正
- [x] α リリース判定（v0.1.0 全 OS 公開済み）

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

## Phase A〜D: Claude Code 相当（エージェント拡張）

> 詳細プラン: [08-エージェント拡張プラン.md](./08-エージェント拡張プラン.md)  
> 方針: Skills / Hooks / Headless / Subagents を優先。Cloud / Teams は後回し。

### Phase A — Skills / 常駐コンテキスト / Permission / Compact

- [x] Skills スキーマ定義（`SKILL.md` / frontmatter）
- [x] Skills ローダー（`.codex/skills/`）
- [x] チャット入力の `/skill` 起動・候補表示
- [x] Skills 実行時の system / user 注入
- [x] サンプル Skills（review / security / explain 等）3 本以上
- [x] プロジェクト常駐 MD 読込（`CODEX.md` / `CLAUDE.md` / `AGENTS.md`）
- [x] Rules と常駐 MD の優先順位・結合ルール文書化
- [x] Permission モード型（allow / ask / deny × ツールカテゴリ）
- [x] Permission 設定 UI（設定画面）
- [x] Agent 実行時の Permission 適用（YOLO との関係整理）
- [x] Compact：閾値超過時の自動要約
- [x] Compact：手動実行（チャットまたはコマンド）
- [x] Phase A のユニットテスト
- [x] ユーザーガイド更新（Skills / Permission / Compact）

### Phase B — Hooks / Headless CLI

- [x] Hooks 設定スキーマ（`hooks.json`）
- [x] Hook ランタイム（onFileSave / onAgentComplete 等）
- [x] Hook 再入防止・パス除外
- [x] Hook から Shell / Skill 起動
- [x] agent-core を Electron 非依存で起動可能に整理
- [x] Headless CLI エントリ（`codex-studio agent` 仮称）
- [x] CLI：ワークスペース指定・モデル・Permission プロファイル
- [x] CLI：非対話（deny 以外は失敗 or 明示 allow プロファイル）
- [x] Hooks / CLI の E2E または統合テスト
- [x] ユーザーガイド更新（Hooks / CLI）

### Phase C — Subagents / Memory / WebSearch

- [x] Subagent タスク定義（目的・許可ツール・コンテキスト）
- [x] 親 Agent からの spawn API
- [x] 並列実行（上限・キャンセル）
- [x] 子結果の統合（要約マージ）
- [x] Subagent 用 UI（進捗・結果カード）
- [x] 承認の集約（親セッションに集約 or 一括）
- [x] Auto Memory オプトイン設定
- [x] `MEMORY.md` / `.codex/memory/` への追記・読込
- [x] WebSearch ツール（組み込み or MCP 経由）
- [x] Phase C テスト・ガイド更新

### Phase D — Teams / Cloud / Remote（必要時）

- [x] Agent Teams（役割・共有ボード）設計
- [x] Agent Teams（ローカル実装: team.json / BOARD / CLI / `/team`）
- [x] チーム共有 Skills（`~/.codex-studio/skills`）
- [x] Cloud Execution（管理 VM）設計 → **見送り**（ゲート文書）
- [x] Remote Control（ブラウザ遠隔）設計 → **見送り**（ゲート文書）
- [x] 実装判断ゲート（需要・コスト・セキュリティ）→ [09-PhaseD-設計ゲート.md](./09-PhaseD-設計ゲート.md)

---

## 進捗サマリー（2026-07-17 時点）

| Phase | 状態 | 備考 |
|-------|------|------|
| Phase 0 基盤 | ほぼ完了 | husky / CONTRIBUTING 残 |
| Phase 1 エディタ | ほぼ完了 | ウォッチャー完了 |
| Phase 2 索引+チャット | ほぼ完了 | SQLite は Post-MVP |
| Phase 3 Agent+ツール | 完了 | Worker Thread 分離は未 |
| Phase 4 リリース | 進行中 | v0.1.x、インストーラ・CI 改善継続 |
| **エージェント拡張 A** | **完了** | Skills / 常駐 MD / Permission / Compact |
| **エージェント拡張 B** | **完了** | Hooks / Headless CLI |
| **エージェント拡張 C** | **完了** | Subagents / Memory / WebSearch |
| **エージェント拡張 D** | **完了（ローカル）** | Teams + 共有 Skills。Cloud/Remote はゲートで見送り |

---

## 今週のフォーカス

1. Phase A〜D dogfooding
2. α リリース周辺の安定化
3. Cloud/Remote は [09](./09-PhaseD-設計ゲート.md) の条件が揃うまで着手しない

---

## メモ・決定事項

| 日付 | 内容 |
|------|------|
| 2026-07-15 | プロジェクト名「Codex Studio（仮称）」で文書一式作成 |
| | Electron + React + Monaco で MVP 構築方針決定 |
| | MCP / Tab 補完は Post-MVP に延期 |
| **2026-07-17** | **Claude Code 相当機能を段階導入する方針を決定（プラン 08）** |
| | **優先: Skills → 常駐 MD → Permission → Compact → Hooks → Headless → Subagents** |
| 2026-07-17 | Phase A 実装完了（Skills / 常駐 MD / Permission / Compact） |
| 2026-07-17 | Phase B 実装完了（Hooks / Headless CLI） |
| 2026-07-17 | Phase C 実装完了（Subagents / Memory / WebSearch） |
| 2026-07-17 | Phase D: Local Teams + 共有 Skills 実装。Cloud/Remote は設計ゲートで見送り |
| | **非優先: Cloud VM / Remote Control（ゲート未達）** |
| | **Cursor 完全追随（Tab 補完等）はエージェント拡張と並行しすぎない** |
