# セキュリティチェックリスト（MVP α）

改善ロードマップ: [24-企画](./24-セキュリティ改善企画書.md) / [25-プラン](./25-セキュリティ改善プラン.md) / [26-設計](./26-セキュリティ改善設計書.md) / [27-WBS-ToDo](./27-セキュリティ改善-WBS-ToDo.md) / [28-audit](./28-audit-prod-triage.md)

進捗（2026-11-09）: S0–S3 主要項目完了（Electron 45、invoke 全廃、信頼ハッシュ、env allowlist、秘密 Read / 未信頼 network）。残は S4 体験・保守。

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | Renderer サンドボックス | ⚠️ | `contextIsolation` + `sandbox: true`。preload は CJS（`.cjs`）必須。ESM preload だと起動不能 |
| 2 | ワークスペース外パス拒否 | ✅ | `WorkspaceFs` + `realpath` / unlink 専用解決。Write/Read/Delete/Memory/Board は ctx.fs 経由。ESLint で対象ファイルの生 `fs` 禁止 |
| 3 | Write/Shell はデフォルト承認必須 | ✅ | YOLO でのみ無効化。MCP/メディアは preview で外部呼び出ししない。Team も `requiresApproval` |
| 4 | IPC 入力検証 + 送信元検証 | ✅ | path / sessionId 検証 + trusted renderer URL（完全一致） |
| 5 | CSP（本番ビルド） | ✅ | Main で設定 |
| 6 | 外部リンクは OS ブラウザで開く | ✅ | setWindowOpenHandler。`file://` は自アプリ index.html のみ |
| 7 | API キーは Renderer に露出しない | ✅ | Main + redact + safeStorage |
| 8 | 監査ログ（書込・承認） | ⚠️ | `userData/logs/audit.jsonl`（Shell 詳細は今後強化） |
| 9 | Shell denylist | ⚠️ | 補助的。権限・承認・タイムアウトが本線 |
| 10 | Markdown XSS 対策 | ✅ | react-markdown + Mermaid エラーは `textContent` |
| 11 | OS Keychain 連携 | ✅ | Electron `safeStorage` → `secrets.enc.json`。暗号化不可 / 保存失敗時は **平文ディスク書き込みなし**（メモリ保持のみ）。設定 UI の「削除」で OS ストアから消去。検証: `tests/secret-settings.test.ts`（`stripSecretsForDisk` / `mergeApiKeyField`） |
| 12 | コード署名・公証 | ⚠️ | Secrets 設定時に CI で公証（未設定時は署名なし） |
| 13 | ワークスペース信頼 | ✅ | hooks/agent.env ハッシュ再確認、Settings で信頼/解除、StatusBar 表示。未信頼時は Hooks / agent.env / WS Rules·Skills·Teams·Personas 無効 |
| 14 | enabledTools / 権限の正規化 | ✅ | 実行直前に allow-list + 大小文字無視のカテゴリ判定 |

## レビュー実施記録

| 日付 | レビュア | 結果 |
|------|----------|------|
| 2026-07-15 | Sprint 5 | MVP α 向けチェック完了（項目 10–12 は Phase 2） |
| 2026-11-09 | 外部レビュー対応 | P0（XSS/IPC、preview 実行、信頼、権限、realpath）を改修 |
| 2026-11-09 | 再レビュー対応 | preload CJS、Write symlink 親検証、Hooks 環境変数渡し、Team env/承認 |
| 2026-11-09 | 再々レビュー対応 | ESM 向け electron-store 静的 import、MemoryAppend/Board の path 検証 |
| 2026-11-09 | 最終確認対応 | Hooks の `bash -c` / `eval` 展開、第 2 ルートの symlink 削除 |
| 2026-11-11 | レビュー対応 | 秘密の平文フォールバック廃止、キー削除 UI、PDF アセット/Worker 破棄、MCP env/cwd・JSON Schema |

## 既知の制限

- YOLO モード ON 時は LLM が任意のファイル変更・Shell 実行可能
- CLI は OS 秘密ストアを読めない（環境変数が必要）。ワークスペース env は `CODEX_TRUST_WORKSPACE=1` 時のみ適用
- Shell denylist は回避可能なため境界としては扱わない
- 日次予算への Team/Subagent 集計、監査ログの詳細化は未完了（P1）
- Electron は **45.2.3** へ更新済み（[release.md](./release.md)）。`pnpm audit --prod` は [28](./28-audit-prod-triage.md)。未署名リリースは Secrets 未設定時の既定
- `.codex/agent.env` の `0600` は新規作成時のみ。他プロジェクトの `.gitignore` 追記は未対応
- Grep/Glob など検索系はまだ `resolvePath` 依存（WorkspaceFs 全面化は検索ツールが残）
- Hooks の変数は `bash -c` / `eval` / `pwsh -c` まで安全に展開する。`ssh host '...${file}...'` など別の経路で再解釈されるコマンドは対象外
- `safeStorage` が使えない環境では API キーはプロセスメモリのみ。再起動後は再入力が必要（設定 JSON への平文フォールバックは行わない）
