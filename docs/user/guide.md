# Codex Studio ユーザーガイド

機能別の参照です。手順中心は [操作マニュアル](./操作マニュアル.md) を見てください。

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
信頼できる環境でのみ使用してください。YOLO が ON のときは下記 Permission より優先されます。

### Permission モード

設定でツール種別ごとに `allow` / `ask` / `deny` を指定できます（既定: 読取=allow、編集・Shell=ask）。

| カテゴリ | 対象ツール |
|----------|------------|
| read | Read / Grep / Glob |
| edit | Write / StrReplace / Delete |
| shell | Shell |

`deny` にしたツールは実行されず、Agent に拒否結果が返ります。

## Shell 環境（プロファイル・環境変数）

Agent の Shell はログインプロファイルを自動読込します。ターミナルだけの `export` や `oc login` セッション変数は、ターミナルの **「環境を Agent に同期」** か `.codex/agent.env` で渡せます。詳細は [シェル環境と細かい機能メモ](../11-シェル環境と細かい機能メモ.md)。

### 最大イテレーション

Agent が 1 回の実行でツールを呼び出せる回数の上限です（既定: 100）。  
大きなタスクで途中停止する場合は、設定の **最大イテレーション** を引き上げてください。

### Compact

長い会話では履歴が膨らみます。

- **自動**: 設定の Compact 閾値（推定トークン）を超えると Agent 実行中に履歴を圧縮
- **手動**: AI Chat パネルの **Compact** でセッション履歴を要約・短縮

## Skills（スラッシュコマンド）

`.codex/skills/<name>/SKILL.md` を配置すると、チャットで `/name` から起動できます。

```markdown
---
name: review
description: Review recent changes
argument-hint: optional focus
---

Review steps go here...
```

入力欄で `/` と打つと候補が出ます。例: `/review`、`/security IPC`、`/explain packages/app`。

このリポジトリにはサンプルとして `review` / `security` / `explain` があります。

## プロジェクト常駐コンテキスト

ワークスペース直下の次のファイルがあれば、Rules に続けて system prompt に自動注入されます。

| ファイル | 用途 |
|----------|------|
| `CODEX.md` | Codex Studio 向けプロジェクト概要（推奨） |
| `CLAUDE.md` | Claude Code 互換 |
| `AGENTS.md` | 汎用エージェント向け |

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
常駐コンテキスト（`CODEX.md` 等）は Rules の後に結合されます（Rules = 制約、常駐 MD = プロジェクト概要）。

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

## Hooks（イベント駆動）

`.codex/hooks.json` で保存時・Agent 完了時に Shell または Skill を起動できます。

1. サンプルをコピー: `cp .codex/hooks.example.json .codex/hooks.json`
2. エディタでファイルを保存 → `onFileSave` が発火
3. Agent が正常完了 → `onAgentComplete` が発火

```json
{
  "hooks": [
    {
      "event": "onFileSave",
      "paths": ["**/*.{ts,tsx}"],
      "exclude": ["**/node_modules/**", "**/out/**"],
      "action": {
        "type": "shell",
        "command": "echo saved ${relativePath}"
      },
      "cooldownMs": 2000
    }
  ]
}
```

| 項目 | 説明 |
|------|------|
| `event` | `onFileSave` / `onAgentComplete` |
| `paths` / `exclude` | 相対パスの glob（`onFileSave`） |
| `action.type` | `shell` または `skill` |
| 変数 | `${file}` `${relativePath}` `${workspace}` `${sessionId}` |

**安全策**: フック実行中の再入は無視。クールダウンで連続発火を抑制。Skill フックは非対話（承認待ちは拒否）で headless Agent を起動します。

## Headless CLI

Electron なしで同じ agent-core を実行できます。

```bash
pnpm cli -- agent "README を要約して" -w .
# または（node_modules/.bin 経由）
pnpm exec codex-studio agent "/review" --profile allow
```

※ `codex-studio` をそのまま打っても PATH には入りません。グローバルに使いたい場合は `pnpm link --global`（ルートで）を実行してください。

| オプション | 説明 |
|------------|------|
| `-w, --workspace` | ワークスペース（既定: cwd） |
| `-p, --provider` | `openai` / `anthropic` / `ollama` |
| `-m, --model` | モデル ID |
| `--profile` | `readonly`（既定）/ `ask` / `allow` |
| `--yolo` | 全ツール allow |
| `--json` | 結果を JSON で出力 |

環境変数: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OLLAMA_BASE_URL`  
CI では `--profile readonly` を推奨。書込が必要なときだけ `--profile allow`。

## Subagents（Task）

Agent は `Task` ツールで読取専用サブエージェントを並列起動できます。

- 子 Agent が使えるツール: Read / Grep / Glob のみ（書込・Shell・入れ子 Task 不可）
- 同じターンで複数 `Task` を呼ぶと並列実行（設定の並列上限で制御）
- チャット上は `Task` カードに説明ラベルが表示されます

例: 「認証と IPC を別々に調査してからまとめて」と依頼すると、モデルが Task を複数回呼ぶ想定です。

## Auto Memory

| 方法 | 説明 |
|------|------|
| 設定の Auto Memory | Agent 完了後に要約を `.codex/memory/MEMORY.md` へ追記（オプトイン） |
| MemoryAppend ツール | Agent が重要な規約・決定を明示的に追記（承認対象） |

次回以降の Ask / Agent で memory が system prompt に注入されます。

## WebSearch

`WebSearch` ツールで公開 Web を検索します（DuckDuckGo HTML、API キー不要）。  
権限カテゴリは `network`（既定 allow。設定で deny 可）。

## Agent Teams（ローカル）

複数役割の読取専用エージェントを並列実行し、共有ボードに書いてから統合します。

配置:

```
.codex/teams/<id>/team.json
.codex/teams/<id>/BOARD.md
```

起動例:

```bash
pnpm cli -- team list -w .
pnpm cli -- team run review-squad "IPC と権限をレビュー" -w .
```

チャット（Agent）では `/team review-squad …` またはモデルが `Team` ツールを呼びます。

共有 Skills: ワークスペースの `.codex/skills` に加え `~/.codex-studio/skills` も読みます（同名はワークスペース優先）。

Cloud VM / ブラウザ遠隔操作は **未実装**（判断ゲートは [docs/09-PhaseD-設計ゲート.md](../09-PhaseD-設計ゲート.md)）。

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| Agent が動かない | `pnpm dev` を再起動（Main プロセスの更新が必要） |
| API エラー | 設定画面でキーとプロバイダを確認 |
| Ollama 接続失敗 | `ollama serve` が起動しているか確認 |
| Shell で `oc` / パスが見つからない | プロファイル自動読込を確認。足りなければターミナルで PATH を直して **環境を Agent に同期** |
| `export` した変数が Agent に無い | ターミナルの **環境を Agent に同期**、または `.codex/agent.env` |
| Hooks が動かない | `.codex/hooks.json` の有無・glob・再起動を確認 |
| CLI が API キーエラー | 環境変数を export してから実行 |
| `codex-studio: command not found` | `pnpm cli -- ...` または `pnpm exec codex-studio ...` を使う |
| CLI がヘルプだけ出る | `pnpm cli -- agent "..."` のように `--` の後に引数を置く |
| エディタが読み込み中のまま | アプリ再起動 |

## キーボード

| 操作 | macOS | Windows |
|------|-------|---------|
| 保存 | Cmd+S | Ctrl+S |
