# 改善計画・WBS・ToDo：セキュリティ・品質

| 項目 | 内容 |
|------|------|
| 版 | 1.1 |
| 作成日 | 2026-11-09 |
| 更新日 | 2026-11-09（S2: WorkspaceFs ツール移行・preview/apply・ESLint） |
| 関連 | [24-セキュリティ改善企画書](./24-セキュリティ改善企画書.md)、[25-セキュリティ改善プラン](./25-セキュリティ改善プラン.md)、[26-セキュリティ改善設計書](./26-セキュリティ改善設計書.md)、[28-audit-prod-triage](./28-audit-prod-triage.md) |

> ステータス: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 / `[-]` キャンセル  
> 工数見積は 1 人日換算の目安（並行・習熟で変動）。

---

## 1. 改善計画（タイムライン）

| 週 | Phase | マイルストーン |
|----|-------|----------------|
| W1 | S0 | 配布ゲート方針確定、パッケージ起動 1 回実証 |
| W1–W2 | S1 | `tests/security` 骨格 + E2E（workspace:open / codex）CI 組み込み |
| W3–W5 | S2 | WorkspaceFs 移行完了、preview/apply、ESLint error |
| W6–W7 | S3 | 信頼ハッシュ、秘密ファイル、env allowlist、preload 制限 |
| W8–W10 | S4 | 巻き戻し・セッション許可・分割・監査/コストの優先分 |
| 以降 | 公開ゲート | OS 級 Shell 隔離（判断後） |

```
W1        W2        W3        W4        W5        W6        W7        W8–W10
├─ S0 ────┤
├─ S1 ─────────────┤
          ├──────── S2 ──────────────────┤
                                         ├──── S3 ────┤
                                                      ├── S4 ──────────┤
```

---

## 2. WBS

```
2. セキュリティ改善イニシアチブ
├── 2.0 配布ゲート (S0)
├── 2.1 検出ゲート (S1)
├── 2.2 構造ゲート (S2)
├── 2.3 境界ゲート (S3)
├── 2.4 体験・保守 (S4)
├── 2.5 一般公開ゲート（将来）
└── 2.6 ローカル LLM 性能（横断）
```

### 2.0 配布ゲート（S0）

| WBS ID | タスク | 目安 | 依存 | 担当 | 状態 |
|--------|--------|------|------|------|------|
| 2.0.1 | Electron バージョン差分調査と更新/据置方針 | 1d | - | BE | [x] → [release.md](./release.md)（`^45.2.3` へ更新済み） |
| 2.0.2 | 署名・公証フロー確認（Secrets 有無） | 0.5d | - | DevOps | [x] release.yml + release.md と checklist を一致 |
| 2.0.3 | electron-builder パッケージ起動スモーク | 1d | 2.0.1 | BE | [x] → [release.md](./release.md) 記録済 |
| 2.0.4 | `pnpm audit --prod` 分類（修正/許容/更新） | 1d | - | BE | [x] → [28](./28-audit-prod-triage.md) |
| 2.0.5 | U-3（packaged E2E 必須可否）決定 | 0.5d | 2.0.3 | PO | [x] → CI は現行 e2e 必須、パッケージは手動 |
| 2.0.6 | release / checklist 文書更新 | 0.5d | 2.0.1–2.0.5 | BE | [x] |

### 2.1 検出ゲート（S1）

| WBS ID | タスク | 目安 | 依存 | 担当 | 状態 |
|--------|--------|------|------|------|------|
| 2.1.1 | `tests/security/` ディレクトリと命名規約 | 0.5d | - | BE | [x] |
| 2.1.2 | PoC マッピング表（シナリオ ID） | 1d | 2.1.1 | BE | [x] |
| 2.1.3 | path / hooks / team / env / memory の unit 移植 | 3d | 2.1.2 | BE | [x] |
| 2.1.4 | E2E: `window.codex` + preload CJS | 1d | - | BE | [x] |
| 2.1.5 | E2E: `workspace:open`（信頼フラグ明示） | 1.5d | 2.1.4 | BE | [x] |
| 2.1.6 | CI ジョブ必須化（unit security + e2e） | 1d | 2.1.3, 2.1.5 | DevOps | [x]（既存 CI が vitest 全体 + e2e を実行） |
| 2.1.7 | PR セキュリティチェックリスト | 0.5d | - | BE | [x] |

### 2.2 構造ゲート（S2）

| WBS ID | タスク | 目安 | 依存 | 担当 | 状態 |
|--------|--------|------|------|------|------|
| 2.2.1 | WorkspaceFs API 実装 + 単体テスト | 2d | 2.1.3 | BE | [x] |
| 2.2.2 | Write / StrReplace / Delete 移行 | 1.5d | 2.2.1 | BE | [x] |
| 2.2.3 | MemoryAppend / memory.ts / appendBoard 移行 | 1d | 2.2.1 | BE | [x] |
| 2.2.4 | Read 系パスの WorkspaceFs 利用 | 1d | 2.2.1 | BE | [x] |
| 2.2.5 | Tool `preview` / `apply` インターフェース変更 | 2d | 2.2.2 | BE | [x] Write/StrReplace/Delete/Memory/Team/Shell |
| 2.2.6 | Orchestrator 承認一本化（ask 必須） | 1d | 2.2.5 | BE | [x] `perm === 'ask'` で preview+承認 |
| 2.2.7 | ESLint no-restricted-imports（warn→error） | 1d | 2.2.3, 2.2.4 | BE | [x] 対象ツール/memory/team-runner |
| 2.2.8 | マルチルート Delete/Read 対称性確認 | 0.5d | 2.2.2 | BE | [x] WorkspaceFs + security/symlink テスト |
| 2.2.9 | security テスト全緑 + checklist 更新 | 0.5d | 2.2.6–2.2.8 | BE | [x] |

### 2.3〜2.5

S3 / S4 / 一般公開ゲートの詳細 WBS は版 1.0 と同じ（未着手）。S4 のうちローカル LLM 性能は **2.6** に切り出し済み。

### 2.6 ローカル LLM 性能（横断・2026-11 実装）

| WBS ID | タスク | 状態 |
|--------|--------|------|
| 2.6.1 | Ollama にも compact/context budget キャップ | [x] |
| 2.6.2 | ローカル出力トークン / subagent 上限 | [x] |
| 2.6.3 | ローカル時 Tab 補完スキップ（allowOnLocal） | [x] |
| 2.6.4 | Ollama agentChat に max_tokens | [x] |
| 2.6.5 | llama.cpp Agent へ CoT 非注入 | [x] |
| 2.6.6 | 設定 UI（ollama context / 補完オプション）+ 文書 §7 | [x] |

---

## 3. ToDo リスト

### S0 配布ゲート

- [x] Electron 更新方針を文書化（更新する / 据え置く理由）→ [release.md](./release.md)
- [x] 署名・公証の現状を `docs/release.md` と checklist で一致させる
- [x] パッケージ版を 1 回起動し、結果を記録する → [release.md](./release.md)
- [x] `pnpm audit --prod` を critical/high 中心に分類する → [28-audit-prod-triage.md](./28-audit-prod-triage.md)
- [x] packaged E2E を CI 必須にするか決定する（U-3）→ 現行 e2e 必須、パッケージは手動

### S1 検出ゲート

- [x] `tests/security/` を作成する
- [x] レビュー PoC をシナリオ ID にマッピングする
- [x] path / hooks / team / env の回帰テストを移植する
- [x] E2E に `window.codex` 検証を追加する
- [x] E2E に `workspace:open` を追加する（フィクスチャ直開き以外）
- [x] 信頼ダイアログ経路の扱い（自動信頼フラグ）をテストコメントに明記する
- [x] CI で security unit + e2e を必須にする（既存パイプラインでカバー）
- [x] PR 用セキュリティチェックリストを追加する

### S2 構造ゲート

- [x] `WorkspaceFs` を実装する（スケルトン + テスト）
- [x] Write / StrReplace / Delete を移行する
- [x] MemoryAppend / memory / Team BOARD を移行する
- [x] Read 系を移行する
- [x] `Tool.preview` / `Tool.apply` に分離する
- [x] orchestrator の承認を `ask` 一本化する
- [x] ESLint で `fs` 直接 import を禁止する（最終 error）
- [x] マルチルートの Delete/Read 対称を security テストで固定する
- [x] `security-checklist.md` を実測に合わせて更新する

### S3 境界ゲート

- [x] 秘密ファイルポリシー（ask/deny）を決定する（U-1）→ 設計書 §7.1
- [x] 未信頼 network ポリシーを決定する（U-2）→ 設計書 §7.2
- [x] 未信頼時 network 制限を実装する
- [x] 秘密パスの Read 制限を実装する（`secret-paths` + Read preview/deny）
- [x] 信頼コンテンツハッシュと再確認を実装する
- [x] 信頼解除 UI を追加する（Settings → Features + StatusBar）
- [x] env を allowlist 化する（端末 PATH 例外を文書化）→ [11](./11-シェル環境と細かい機能メモ.md)
- [x] preload の typed API 化（汎用 `invoke` 廃止。`window.codex.*` のみ）
- [x] CLI ヘルプに信頼フラグを記載する
- [x] Electron 45 更新（`^45.2.3` + node-abi override）

### S4 体験・保守

- [ ] ターン単位の変更セットを記録する
- [ ] 「このターンを取り消す」UI を追加する
- [ ] セッション許可ルールを追加する
- [ ] MCP をツール単位権限にする
- [ ] Team/Subagent を日次予算・表示に入れる
- [ ] 監査ログ閲覧画面を追加する
- [ ] SettingsDialog / app-store / agent.ts を分割する
- [ ] agent.ts・IPC のカバレッジ除外を解除する
- [ ] agent-benchmark のローカルモデル評価手順を残す

### ローカル LLM 性能（2.6）

- [x] Context budget キャップ（Ollama / llama.cpp）
- [x] 出力トークン・Subagent 上限
- [x] Tab 補完のローカル抑制
- [x] Ollama max_tokens / llama.cpp CoT 非注入
- [x] 設定 UI と docs/11 §7

### 将来（一般公開）

- [ ] Shell OS 隔離の対象 OS を決める（U-4）
- [ ] sandbox-exec / bubblewrap の試作と受け入れ基準を作る

---

## 4. 優先 ToDo（次のスプリント）

1. [x] S1: `tests/security` + E2E codex / workspace:open
2. [x] S0: audit 分類 + U-3
3. [x] S2: WorkspaceFs スケルトン
4. [x] S2: ツール移行（Write/Delete/Memory/Board）+ ESLint
5. [x] S0: パッケージ起動スモーク記録・Electron 方針
6. [x] S2: preview/apply 分離
7. [x] S2: security-checklist 実測更新
8. [x] S0: Electron 方針文書化 + パッケージ起動スモーク
9. [x] S3: 秘密ファイル / 未信頼 network 方針＋実装（U-1/U-2）
10. [x] S3: 信頼ハッシュ / 解除 UI / env allowlist / preload typed（invoke 残）
11. [x] S3: invoke 全廃・typed API 全面化
12. [x] Electron 45 更新

---

## 5. 進捗の更新ルール

1. タスク完了時に本 ToDo のチェックを更新する
2. Phase 完了時に [25-セキュリティ改善プラン](./25-セキュリティ改善プラン.md) の完了条件を照合する
3. 境界や受け入れの変更は [26-セキュリティ改善設計書](./26-セキュリティ改善設計書.md) の未決事項を先に閉じる
4. チェックリストの「実態より良い記載」を禁止し、[security-checklist.md](./security-checklist.md) を同 PR で直す
