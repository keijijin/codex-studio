# L1 — LINE 通知設計

| 項目 | 内容 |
|------|------|
| 文書名 | L1 LINE 通知設計 |
| 版 | 0.1 |
| 作成日 | 2026-08-06 |
| ステータス | Planned |
| 関連 | [将来プラン](./14-LINE-K8sエージェント将来プラン.md) / [Hooks](./08-エージェント拡張プラン.md) / [ToDo](./07-TODOリスト.md) |

---

## 1. 目的

Desktop Codex Studio で Agent ターンが完了したとき、**LINE に要約 Push** できるようにする。  
双方向（LINE → Agent）や Write/Shell 実行は **L1 の範囲外**（L3）。

### 完了条件

1. LINE Official Account / Messaging API Channel が用意できる  
2. Desktop の `onAgentComplete` Hook から Push が飛ぶ  
3. 通知本文にセッション名・結果要約・（任意）コストが含まれる  
4. Write / Shell は一切実行しない  

---

## 2. アーキテクチャ

```
Codex Studio (Desktop Main)
  Agent 完了
    → hooksService.onAgentComplete(sessionId)
      → .codex/hooks.json の onAgentComplete
        → shell / http アクション
          → LINE Messaging API Push
```

L1 では **専用マイクロサービスを必須にしない**。既存 Hooks を拡張し、設定で Channel Access Token / userId を渡す。

```
オプション A（推奨・最短）:
  Hook action: http POST → LINE Push API

オプション B:
  Hook action: shell → 小さな node/curl スクリプト
```

---

## 3. 設定

### 3.1 AppSettings（案）

```typescript
interface LineNotifySettings {
  enabled: boolean
  /** Messaging API Channel Access Token（暗号化保存推奨） */
  channelAccessToken?: string
  /** 通知先 userId（開発時は自分の ID） */
  toUserId?: string
  /** Push 本文の最大文字数 */
  maxChars: number // default 400
}
```

Desktop 設定 UI に「LINE 通知」セクションを追加する（後続）。当面は環境変数でも可:

| 変数 | 用途 |
|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel Access Token |
| `LINE_NOTIFY_USER_ID` | Push 先 userId |

### 3.2 Hooks 例（`.codex/hooks.json`）

```json
{
  "hooks": [
    {
      "event": "onAgentComplete",
      "actions": [
        {
          "type": "http",
          "url": "https://api.line.me/v2/bot/message/push",
          "headers": {
            "Authorization": "Bearer ${LINE_CHANNEL_ACCESS_TOKEN}",
            "Content-Type": "application/json"
          },
          "bodyTemplate": {
            "to": "${LINE_NOTIFY_USER_ID}",
            "messages": [
              {
                "type": "text",
                "text": "Codex Studio 完了\n${summary}"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

> 現状の Hooks が `shell` のみの場合は、L1-1 で `http` アクションを追加するか、同梱スクリプト `scripts/line-push.mjs` を shell で呼ぶ。

---

## 4. ペイロード設計

| フィールド | 内容 |
|------------|------|
| `sessionId` | セッション ID |
| `workspaceName` | 開いているフォルダ名 |
| `success` | 成功 / 失敗 |
| `summary` | アシスタント最終応答の先頭 N 文字 |
| `personaName` | sticky Persona（あれば） |
| `provider` / `model` | 使用モデル |
| `estimatedCostUsd` | 概算コスト（あれば） |

要約は **Reply ではなく Push**。枠消費に注意し、スパム防止のため:

- 同一 session で 30 秒以内の連続完了は間引き  
- Ask モード完了は任意（設定でオフ可）  
- Agent モード完了のみ既定オン  

---

## 5. 実装タスク（案）

| ID | 内容 | 依存 |
|----|------|------|
| L1-1 | Hook に `http` アクション、または `scripts/line-push.mjs` | Hooks 既存 |
| L1-2 | `onAgentComplete` に summary / trace コンテキストを渡す | agent / chat |
| L1-3 | 設定 or env で Token / userId | settings |
| L1-4 | 操作マニュアル・サンプル hooks | docs |
| L1-5 | 手動受け入れ（完了 → LINE 受信） | — |

---

## 6. セキュリティ

| リスク | 対策 |
|--------|------|
| Token 漏洩 | Renderer に渡さない。Main / Hook 環境のみ |
| 誤爆 Push | 既定オフ。userId は自分用から開始 |
| 本文に秘密 | summary はツール出力全文ではなく最終テキストのみ。パスは相対のみ |
| Webhook | L1 では受信しない（公開 HTTPS 不要） |

---

## 7. 非目標（L1）

- LINE からタスク投入  
- Flex 承認ボタン  
- K8s / 常時サーバ  
- グループトーク大量配信  

---

## 8. 受け入れテスト

1. Token / userId を設定  
2. Agent で短いタスクを完了  
3. LINE に要約が届く  
4. Token 未設定時は Hook が失敗しても Agent 本体は成功のまま（ベストエフォート）  

---

## 9. 決定ログ

| 日付 | 内容 |
|------|------|
| 2026-08-06 | L1 は Desktop → LINE Push のみ。既存 Hooks を本線にし、双方向は L3。 |
