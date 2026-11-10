# チーム Rules 共有設計（N5-3）

| 項目 | 内容 |
|------|------|
| 版 | 0.1（設計のみ） |
| 作成日 | 2026-08-08 |
| 実装ゲート | SSO / 組織需要後、または Git 運用で先行可 |

## 目的

個人の `.codex/rules` に加え、**組織・チーム単位の Rules** を同じ優先度モデルで配布し、Agent の振る舞いを揃える。

## レイヤ（優先度・高→低で上書き）

1. **セッション sticky**（UI / `/persona` 相当の一時指示）
2. **ユーザー Rules**（`~/.codex/rules` またはアプリ userData）
3. **ワークスペース Rules**（`.codex/rules`）
4. **チーム Rules**（組織配布・読み取り専用）
5. **ビルトイン / スキル**

衝突時は上位が勝つ。チーム Rules は「最低限守る」用途のため、**deny リストや必須チェック**はチーム層で強制し、ユーザーが下げられないフラグ（`immutable: true`）を frontmatter で持てるようにする。

## 配布チャネル（段階）

| フェーズ | 方式 | 備考 |
|---------|------|------|
| A | Git サブモジュール / 社内 npm パッケージを `.codex/team-rules` に配置 | SSO 不要で先行可能 |
| B | 組織設定サービス（HTTPS）から起動時に pull | ETag / 署名付きマニフェスト |
| C | SSO 連携後、`org_id` で自動選択 | [22-SSO](./22-SSO-OIDC設計.md) |

## マニフェスト例

```json
{
  "orgId": "acme",
  "version": "2026.08.01",
  "rules": [
    { "id": "sec-baseline", "path": "security.md", "immutable": true },
    { "id": "style", "path": "style.md", "immutable": false }
  ],
  "signature": "…"
}
```

## ローカルキャッシュ

- 保存先: `userData/team-rules/<orgId>/<version>/`
- オフライン: 最後に成功したバージョンを使用し、UI に「オフライン・キャッシュ」を表示
- 改ざん検知: マニフェスト署名検証失敗時は適用せず警告

## UI

- 設定 → Rules に「チーム」セクション（読み取り専用プレビュー）
- 更新ボタン / 最終同期時刻
- immutable ルールは編集 UI を出さない

## 監査

チーム Rules の適用・拒否・バージョンを監査ログに記録（既存 `audit-log` + エクスポート）。

## 既存機能との関係

- Persona / Skills はチーム Rules の下で動作（人格は変えてもセキュリティ条文は維持）
- Plan モードの読取専用ツール制限とは独立（Rules はプロンプト層）
