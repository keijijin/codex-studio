# セキュリティチェックリスト（MVP α）

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | Renderer サンドボックス（contextIsolation） | ✅ | preload 経由 IPC のみ |
| 2 | ワークスペース外パス拒否 | ✅ | `resolveWithinWorkspace` |
| 3 | Write/Shell はデフォルト承認必須 | ✅ | YOLO でのみ無効化 |
| 4 | IPC 入力検証 | ✅ | path / sessionId 検証 |
| 5 | CSP（本番ビルド） | ✅ | Main で設定 |
| 6 | 外部リンクは OS ブラウザで開く | ✅ | setWindowOpenHandler |
| 7 | API キーは Renderer に露出しない | ✅ | Main / electron-store |
| 8 | 監査ログ（書込・承認） | ✅ | `userData/logs/audit.jsonl` |
| 9 | Shell denylist | ✅ | tools/shell.ts |
| 10 | Markdown XSS 対策 | ⚠️ | react-markdown、CSP 併用 |
| 11 | OS Keychain 連携 | ⬜ | Post-MVP（現状 electron-store） |
| 12 | コード署名・公証 | ⬜ | 配布時に実施 |

## レビュー実施記録

| 日付 | レビュア | 結果 |
|------|----------|------|
| 2026-07-15 | Sprint 5 | MVP α 向けチェック完了（項目 10–12 は Phase 2） |

## 既知の制限

- YOLO モード ON 時は LLM が任意のファイル変更・Shell 実行可能
- electron-store に API キーを平文保存（Keychain 移行予定）
- MCP 未統合のため外部ツール拡張は Phase 2
