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

### 最大イテレーション

Agent が 1 回の実行でツールを呼び出せる回数の上限です（既定: 100）。  
大きなタスクで途中停止する場合は、設定の **最大イテレーション** を引き上げてください。

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

## プロジェクト Rules（Cursor 互換）

Ask / Agent 両方の system prompt に自動注入されます。

### UI から登録

1. 設定 → **Rules** タブ
2. **追加** でプロジェクト（`.codex/rules`）またはグローバル（`~/.codex-studio/rules`）に保存
3. Always Apply / Globs（例: `**/*.ts, **/*.tsx`）を設定可能

### ファイル配置

| 場所 | 用途 |
|------|------|
| `{workspace}/.codex/rules/*.md` | プロジェクト Rules（推奨） |
| `{workspace}/.cursor/rules/*.{md,mdc}` | Cursor 互換（自動読込） |
| `~/.codex-studio/rules/*.md` | 全プロジェクト共通 |

例:

```markdown
---
alwaysApply: false
globs:
  - "**/*.ts"
  - "**/*.tsx"
description: TypeScript 規約
---

- Use strict TypeScript
- Prefer functional components
```

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
