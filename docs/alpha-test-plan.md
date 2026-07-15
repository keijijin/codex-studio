# α テスト計画書 — Codex Studio v0.1.0

| 項目 | 内容 |
|------|------|
| 版 | 0.1.0 |
| 対象 | Codex Studio α |
| 期間 | 2 週間（目安） |
| テスター | 社内 5〜10 名 |

---

## 1. 目的

MVP α として日常開発に使える品質かを検証し、重大バグ・UX 問題を洗い出す。

---

## 2. 配布物

GitHub Releases から OS 向けインストーラを取得:

https://github.com/keijijin/codex-studio/releases/tag/v0.1.0

| OS | ファイル |
|----|---------|
| macOS | `.dmg` |
| Windows | `.exe` (NSIS) |
| Linux | `.AppImage` / `.deb` |

---

## 3. テスト環境

- OpenAI / Anthropic API キー、またはローカル Ollama のいずれか
- 中規模以下の Git リポジトリ（推奨: 自分の業務プロジェクト）

---

## 4. 必須シナリオ（チェックリスト）

### 4.1 基本操作

- [ ] アプリ起動・Welcome 表示
- [ ] フォルダを開く / 最近のワークスペース
- [ ] ファイルを開く・編集・保存（Cmd/Ctrl+S）
- [ ] Markdown プレビュー / 編集切替
- [ ] XML / Java ファイルのシンタックスハイライト
- [ ] ターミナルパネル（⌨️ または Ctrl/Cmd+`）
- [ ] ワークスペース横断検索

### 4.2 AI チャット（Ask）

- [ ] API キー設定後、質問に回答される
- [ ] ストリーミング表示
- [ ] @file 添付
- [ ] セッション切替

### 4.3 Agent モード

- [ ] 「この関数は何？」→ Read/Grep で調査
- [ ] ファイル変更提案 → 承認ダイアログ → Diff 確認 → Apply
- [ ] Shell 実行（承認フロー）
- [ ] YOLO OFF 時は Write/Shell が必ず承認される

### 4.4 安定性

- [ ] 外部エディタでファイル変更 → IDE に反映
- [ ] 1 時間以上の連続利用でクラッシュしない
- [ ] 大きめリポジトリ（1 万ファイル程度）で索引が完了する

---

## 5. 自動テスト（開発側）

```bash
pnpm test              # ユニット + ベンチマーク 27 件
pnpm test:e2e          # E2E 5 件
pnpm test:benchmark    # Agent ベンチマーク 20 件のみ
```

---

## 6. フィードバック

[alpha-feedback-template.md](./alpha-feedback-template.md) に記入し、GitHub Issue または社内チャネルで共有。

---

## 7. α 判定基準

| 区分 | 基準 |
|------|------|
| **Go** | 必須シナリオ 90% 以上成功、P0 バグ 0 件 |
| **No-Go** | データ損失、API キー漏洩、ワークスpace 外書込 |

---

## 8. 既知の制限（v0.1.0）

- コード署名・公証なし（macOS Gatekeeper 警告の可能性）
- API キーは electron-store 保存（Keychain 未対応）
- MCP / Tab 補完なし
- Android 非対応
