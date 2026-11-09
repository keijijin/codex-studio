# セキュリティチェックリスト（MVP α）

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | Renderer サンドボックス | ⚠️ | `contextIsolation` + `sandbox: true`。preload は CJS（`.cjs`）必須。ESM preload だと起動不能 |
| 2 | ワークスペース外パス拒否 | ⚠️ | `realpath` + 親ディレクトリ検証。マルチルート相対パスは未完了 |
| 3 | Write/Shell はデフォルト承認必須 | ✅ | YOLO でのみ無効化。MCP/メディアは preview で外部呼び出ししない。Team も `requiresApproval` |
| 4 | IPC 入力検証 + 送信元検証 | ✅ | path / sessionId 検証 + trusted renderer URL（完全一致） |
| 5 | CSP（本番ビルド） | ✅ | Main で設定 |
| 6 | 外部リンクは OS ブラウザで開く | ✅ | setWindowOpenHandler。`file://` は自アプリ index.html のみ |
| 7 | API キーは Renderer に露出しない | ✅ | Main + redact + safeStorage |
| 8 | 監査ログ（書込・承認） | ⚠️ | `userData/logs/audit.jsonl`（Shell 詳細は今後強化） |
| 9 | Shell denylist | ⚠️ | 補助的。権限・承認・タイムアウトが本線 |
| 10 | Markdown XSS 対策 | ✅ | react-markdown + Mermaid エラーは `textContent` |
| 11 | OS Keychain 連携 | ✅ | Electron `safeStorage` → `secrets.enc.json` |
| 12 | コード署名・公証 | ⚠️ | Secrets 設定時に CI で公証（未設定時は署名なし） |
| 13 | ワークスペース信頼 | ⚠️ | 未信頼時は Hooks / agent.env / ワークスペース Rules・Skills・Teams・Personas 無効。グローバル定義は有効 |
| 14 | enabledTools / 権限の正規化 | ✅ | 実行直前に allow-list + 大小文字無視のカテゴリ判定 |

## レビュー実施記録

| 日付 | レビュア | 結果 |
|------|----------|------|
| 2026-07-15 | Sprint 5 | MVP α 向けチェック完了（項目 10–12 は Phase 2） |
| 2026-11-09 | 外部レビュー対応 | P0（XSS/IPC、preview 実行、信頼、権限、realpath）を改修 |
| 2026-11-09 | 再レビュー対応 | preload CJS、Write symlink 親検証、Hooks 環境変数渡し、Team env/承認 |
| 2026-11-09 | 再々レビュー対応 | ESM 向け electron-store 静的 import、MemoryAppend/Board の path 検証 |

## 既知の制限

- YOLO モード ON 時は LLM が任意のファイル変更・Shell 実行可能
- CLI は OS 秘密ストアを読めない（環境変数が必要）。ワークスペース env は `CODEX_TRUST_WORKSPACE=1` 時のみ適用
- Shell denylist は回避可能なため境界としては扱わない
- 日次予算への Team/Subagent 集計、監査ログの詳細化は未完了（P1）
- Electron 35 への追従、`npm audit` 未解消件、未署名リリースは未完了
- `.codex/agent.env` の `0600` は新規作成時のみ。他プロジェクトの `.gitignore` 追記は未対応
- マルチルート相対パスの完全対応は未完了
