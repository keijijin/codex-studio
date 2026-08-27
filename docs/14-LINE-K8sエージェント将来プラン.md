# LINE × Kubernetes エージェント将来プラン

| 項目 | 内容 |
|------|------|
| 文書名 | LINE × Kubernetes エージェント将来プラン |
| 版 | 0.1 |
| 作成日 | 2026-08-03 |
| ステータス | Planned（将来） |
| 関連 | [Phase D ゲート](./09-PhaseD-設計ゲート.md) / [エージェント拡張](./08-エージェント拡張プラン.md) / [近接実装](./15-Personas-トレース-権限プリセット.md) / [L1 設計](./18-L1-LINE通知設計.md) / [L2 設計](./19-L2-K8s-Headless設計.md) |

---

## 1. 目的

日本市場向けに **LINE を主チャネル**とし、**Kubernetes 上で Codex Studio の Agent 核を実行**できるようにする。最終形は LINE から投入できる **フル Agent**（読取・限定書込・承認付き Shell）とする。

### 方針（決定事項）

| 決定 | 内容 |
|------|------|
| チャネル | SNS 連携は **LINE 優先**（WhatsApp / Telegram 本線はしない） |
| 移植対象 | Electron UI ではなく **`agent-core` + tools + llm-adapters`（Headless）** |
| Desktop | Codex Studio デスクトップは作者用コンソールとして存続 |
| フル Agent | 最終形。最初から YOLO 開放はしない |
| 段階導入 | L0（Desktop 強化）→ L1（LINE 通知）→ L2（K8s Headless）→ L3（LINE フル Agent）→ L4（硬化） |

### 非目標（当面）

- Electron アプリのコンテナ化そのものを主経路にすること
- 公開インターネットへローカル Main を直接晒す Remote Control
- LINE 以外のメッセンジャー本線

---

## 2. 目標アーキテクチャ

```
LINE ユーザー
    │ Messaging API (Webhook / Reply / Push)
    ▼
Gateway（公開 HTTPS）
  ・署名検証・レート制限・userId 紐付け
    │
    ▼
Orchestrator API（既存 runHeadlessAgent 相当）
    │
    ▼
K8s Job / 短命 Pod
  ・ワークスペース隔離
  ・Tools + Permission + Persona
  ・承認（LINE Flex）またはポリシー
    │
    └── 結果 → LINE Reply / 間引き Push
```

Desktop Codex Studio は同じ `agent-core` を共有し、編集・Diff・Persona 編集に特化する。

---

## 3. フェーズ

### L0 — Desktop 強化（完了）

詳細: [15-Personas-トレース-権限プリセット.md](./15-Personas-トレース-権限プリセット.md)

- [x] Personas V1
- [x] ターン単位トレース
- [x] Permission プリセット（readonly / coding / yolo）

### L1 — LINE 通知（読み取り寄り）

詳細: [18-L1-LINE通知設計.md](./18-L1-LINE通知設計.md)

| 成果 | 完了条件 |
|------|----------|
| LINE Official Account + Channel | Push で Agent 完了通知が届く |
| Hooks 連携 | `onAgentComplete` → LINE Push |
| 双方向なし | Webhook は任意。Write/Shell なし |

**受け入れ**: デスクトップで Agent 完了 → LINE に要約が届く。

### L2 — K8s 上 Headless

詳細: [19-L2-K8s-Headless設計.md](./19-L2-K8s-Headless設計.md)

| 成果 | 完了条件 |
|------|----------|
| API Deployment | ヘルスチェック付き |
| 1 タスク = Job/Pod | ワークスペースは git clone または PVC |
| Secret 管理 | API キーは Secret |
| NetworkPolicy | 既定は最小 |

**ゲート**（[09](./09-PhaseD-設計ゲート.md) を継承）:
1. 需要が文書化されている  
2. 月次コストモデルがある  
3. 脅威モデル（LINE 起点含む）がある  
4. 監査ログ・キルスイッチがある  

### L3 — LINE フル Agent

フル Agent の定義:

1. LINE からタスク投入できる  
2. Read / Grep / 限定 Write ができる  
3. Shell はプロファイル許可時のみ、**承認必須**（Flex ボタン）  
4. 実行はユーザ専用ワークスペースに閉じる  
5. 全操作が監査ログに残る  
6. キルスイッチがある  

| 成果 | 完了条件 |
|------|----------|
| Webhook Gateway | 署名検証・idempotency |
| userId ↔ workspace 紐付け | テナント分離 |
| 承認 UX | 危険ツールは LINE 上で許可/拒否 |
| Persona | `/persona` 相当を LINE でも選択可 |
| Push 間引き | 進捗スパムで枠を溶かさない |

### L4 — エンタープライズ硬化

- Kata / サンドボックスコンテナ
- エージェント固有アイデンティティ
- OpenTelemetry フルトレース
- 社内 IdP / OAuth

---

## 4. LINE 固有の注意

| 項目 | 方針 |
|------|------|
| Reply | ユーザ発話への返信は枠を消費しない → 対話は Reply 優先 |
| Push | 能動通知のみ。月間枠・プランに注意 |
| Webhook | 双方向には公開 HTTPS 必須（自己署名不可） |
| 秘密 | Channel secret / token は K8s Secret。Desktop 設定にもマスク |

---

## 5. 成功指標

- L1: 開発者が外出先で完了通知を LINE で受け取れる  
- L2: CI または staging クラスタで Headless Agent が再現可能  
- L3: LINE から「README の typo を直して」が承認付きで完走し、監査に残る  

---

## 6. 決定ログ

| 日付 | 内容 |
|------|------|
| 2026-08-03 | SNS 連携は日本向けに LINE 優先。K8s 移植は agent-core Headless が核。フル Agent は L3。当面は L0（Personas / トレース / 権限プリセット）を実装。 |
