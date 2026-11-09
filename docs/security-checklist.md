# セキュリティチェックリスト（MVP α）

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | Renderer サンドボックス | ✅ | `contextIsolation` + `sandbox: true` + preload IPC のみ |
| 2 | ワークスペース外パス拒否 | ✅ | `realpath` 付き `resolveWithinWorkspace`（symlink 脱出を遮断） |
| 3 | Write/Shell はデフォルト承認必須 | ✅ | YOLO でのみ無効化。MCP/メディアは preview で外部呼び出ししない |
| 4 | IPC 入力検証 + 送信元検証 | ✅ | path / sessionId 検証 + trusted renderer URL |
| 5 | CSP（本番ビルド） | ✅ | Main で設定 |
| 6 | 外部リンクは OS ブラウザで開く | ✅ | setWindowOpenHandler。`file://` は自アプリ index.html のみ |
| 7 | API キーは Renderer に露出しない | ✅ | Main + redact + safeStorage |
| 8 | 監査ログ（書込・承認） | ✅ | `userData/logs/audit.jsonl`（Shell 詳細は今後強化） |
| 9 | Shell denylist | ⚠️ | 補助的。権限・承認・タイムアウトが本線 |
| 10 | Markdown XSS 対策 | ✅ | react-markdown + Mermaid エラーは `textContent` |
| 11 | OS Keychain 連携 | ✅ | Electron `safeStorage` → `secrets.enc.json` |
| 12 | コード署名・公証 | ⚠️ | Secrets 設定時に CI で公証（未設定時は署名なし） |
| 13 | ワークスペース信頼 | ✅ | 未信頼時は Hooks / agent.env / ワークスペース Rules・Skills 無効 |
| 14 | enabledTools / 権限の正規化 | ✅ | 実行直前に allow-list + 大小文字無視のカテゴリ判定 |

## レビュー実施記録

| 日付 | レビュア | 結果 |
|------|----------|------|
| 2026-07-15 | Sprint 5 | MVP α 向けチェック完了（項目 10–12 は Phase 2） |
| 2026-11-09 | 外部レビュー対応 | P0（XSS/IPC、preview 実行、信頼、権限、realpath）を改修 |

## 既知の制限

- YOLO モード ON 時は LLM が任意のファイル変更・Shell 実行可能
- CLI は OS 秘密ストアを読めない（環境変数が必要）
- Shell denylist は回避可能なため境界としては扱わない
- 日次予算への Team/Subagent 集計、監査ログの詳細化は未完了（P1）
