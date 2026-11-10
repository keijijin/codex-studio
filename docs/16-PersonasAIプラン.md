# Personas AI プラン（V1.1）

| 項目 | 内容 |
|------|------|
| 文書名 | Personas AI |
| 版 | 1.1 |
| 作成日 | 2026-08-03 |
| ステータス | Implemented（V1.1） |
| 関連 | [L0 仕様](./15-Personas-トレース-権限プリセット.md) / [将来プラン](./14-LINE-K8sエージェント将来プラン.md) |

---

## 1. 目的

Personas V1（ファイル + `/persona` 注入）を、**セッションで使い続けられる AI 機能**に仕上げる。

| レイヤ | 役割 |
|--------|------|
| Rules | 規範・制約 |
| **Persona** | 声・優先順位（Personas AI） |
| Skills | 手順・ワークフロー |

---

## 2. ToDo

- [x] V1 基盤（loader / 注入 / サンプル / トレース連携）— プラン 15
- [x] セッション固定 Persona（sticky）— 選んだ Persona をターン跨ぎで維持
- [x] `/persona clear`（または `off`）でセッション Persona 解除
- [x] AI パネルの Persona ピッカー
- [x] 設定の既定 Persona を一覧ドロップダウン化
- [x] 設定タブ「Personas」— 一覧 / 新規 / 編集 / 削除（Rules 風）
- [x] 操作マニュアル更新
- [x] 単体テスト

---

## 3. 解決順序（1 ターン）

```
1. /persona clear|off     → sticky 解除、このターンは Persona なし
2. /persona <name> …      → sticky に name を保存、本文注入
3. session.personaName    → sticky
4. settings.defaultPersona
5. （なし）
```

---

## 4. 受け入れ

- AI パネルで Persona を選ぶと、以降の Ask/Agent にその声が付く
- `/persona mentor …` 後、次のメッセージでも mentor が維持される
- `/persona clear` で解除される
- 設定 Personas タブで新規作成・編集・削除できる
- 既定 Persona はドロップダウンから選べる
