# Codex Studio ユーザーガイド

## はじめに

Codex Studio は AI ネイティブ IDE です。ワークスペースを開き、チャットまたは Agent モードでコードの調査・変更ができます。

## クイックスタート

1. アプリを起動
2. **Open Folder** でプロジェクトフォルダを選択
3. 設定から API キー（OpenAI / Anthropic）または Ollama を設定
4. 右側 **AI Chat** パネルで質問

## モード

| モード | 説明 |
|--------|------|
| **Ask** | 通常のチャット。ファイル添付（`@filename`）に対応 |
| **Agent** | Read / Grep / Glob で調査し、Write / StrReplace で変更を提案 |

## Agent でファイルを変更する

1. **Agent** モードを選択
2. 例: 「README に Installation セクションを追加して」
3. **承認ダイアログ**で Diff を確認
4. **適用** または **却下**

### YOLO モード

設定で **YOLO モード** を ON にすると、承認なしで書込・Shell が実行されます。  
信頼できる環境でのみ使用してください。

## エディタ

- **Explorer** からファイルをクリックして開く
- `.md` ファイルは **プレビュー** / **編集** を切り替え可能
- `Cmd+S`（Windows: `Ctrl+S`）で保存

## 検索

サイドバーの **Search** でワークスペース横断検索（ripgrep）が利用できます。

## プロバイダ設定

| プロバイダ | 設定 |
|-----------|------|
| OpenAI | API キー + モデル選択 |
| Anthropic | API キー + モデル選択 |
| Ollama | Base URL（既定: `http://localhost:11434`）+ ローカルモデル |

環境変数 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OLLAMA_BASE_URL` も利用できます。

## プロジェクト Rules

ワークスペースに `.codex/rules/*.md` を置くと、Agent の system prompt に自動注入されます。

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| Agent が動かない | `pnpm dev` を再起動（Main プロセスの更新が必要） |
| API エラー | 設定画面でキーとプロバイダを確認 |
| Ollama 接続失敗 | `ollama serve` が起動しているか確認 |
| エディタが読み込み中のまま | アプリ再起動 |

## キーボード

| 操作 | macOS | Windows |
|------|-------|---------|
| 保存 | Cmd+S | Ctrl+S |
