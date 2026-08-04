# Personas / ターン単位トレース / 権限プリセット（L0）

| 項目 | 内容 |
|------|------|
| 文書名 | Personas・トレース・権限プリセット |
| 版 | 0.1 |
| 作成日 | 2026-08-03 |
| ステータス | Implemented（V1） |
| 関連 | [将来プラン](./14-LINE-K8sエージェント将来プラン.md) / [エージェント拡張](./08-エージェント拡張プラン.md) |

---

## 1. 目的

OpenClaw 由来の差分のうち、Local-first で効く次の3つを Desktop Codex Studio に入れる。

1. **Personas V1** — 声と優先順位の固定（Rules / Skills とは分離）
2. **ターン単位トレース** — Persona・Tool・モデル・コストの可視化
3. **Permission プリセット** — readonly / coding / yolo の見せ方と適用

---

## 2. Personas V1

### ファイル配置

```
.codex/personas/<name>.md
~/.codex-studio/personas/<name>.md   # グローバル（任意）
```

### フロントマター

```yaml
---
name: strict-reviewer
description: セキュリティと回帰を優先する厳しいレビュアー
---
口調は簡潔。指摘は Critical / Should / Nice で出す。
実装提案より欠陥指摘を優先する。
```

### 入口

| 入口 | 挙動 |
|------|------|
| `/persona <name> …` | 当該ターンの system に persona 本文を注入。残り文言がユーザ発話 |
| 設定 `agent.defaultPersona` | 未指定時の既定 |
| Teams `role.persona` | その役割の subagent に注入 |

### 合成順（system）

```
base system → language → rules(+project+memory) → persona → skill
```

Rules（規範）・Persona（声と優先）・Skill（手順）を混ぜない。

### 同梱サンプル

- `strict-reviewer`
- `mentor`
- `minimal-coder`

---

## 3. ターン単位トレース

### 永続

Assistant `Message` に任意フィールド:

```ts
trace?: {
  personaId?: string
  provider?: string
  model?: string
  routeReason?: string
  usage?: { inputTokens; outputTokens; cachedInputTokens; latencyMs; estimatedCostUsd }
  toolCount?: number
}
```

### ストリーム

- 既存 `routing` / `done.usage` を活用
- 新規 `persona_applied` イベント（personaId, name）

### UI

- AI Panel ヘッダ付近: モデル + Persona + 直近コスト（既存 lastUsage 拡張）
- Tools タブ: セッションのツールログに加え、直近ターンの Persona / モデルを表示

---

## 4. Permission プリセット

| プリセット | 意味 | 権限 |
|------------|------|------|
| `readonly` | 調査のみ | read allow / edit·shell·media deny / network allow |
| `coding` | 通常開発（既定相当） | read allow / edit·shell·media ask / network allow |
| `yolo` | 全自動（自己責任） | すべて allow |

- 設定 UI でプリセットを選ぶと `agent.permissions` を一括適用
- 個別カテゴリを触ると「カスタム」表示
- CLI `--profile` は `readonly` / `coding` / `yolo`（旧 `ask`→coding, `allow`→yolo を受理）

---

## 5. 受け入れ

- `/persona mentor この関数を説明して` で mentor の口調・方針が出る
- Teams role に `persona` を書くとその役割に効く
- Agent 完了後、UI で Persona・モデル・コスト・ツール数が確認できる
- 設定で readonly / coding / yolo を切り替えると権限表が更新される

---

## 6. 実装順序

1. shared 型・Permission プリセット
2. personas-loader + サンプル + Skill `/persona` 互換エントリ
3. agent / chat / headless / teams への注入
4. トレースイベントと Message.trace / UI
5. 設定 UI・操作マニュアル・テスト
