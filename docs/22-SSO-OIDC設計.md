# SSO / OIDC 設計書（N5-2）

| 項目 | 内容 |
|------|------|
| 版 | 0.1（設計のみ） |
| 作成日 | 2026-08-08 |
| 実装ゲート | エンタープライズ需要確定後 |

## 目的

Codex Studio（デスクトップ）と将来のクラウド Agent で、企業 IdP（Okta / Entra ID / Keycloak 等）によるログインと認可を統一する。

## スコープ

| In | Out（当面） |
|----|-------------|
| OIDC Authorization Code + PKCE（デスクトップ） | SAML 直接 |
| 組織ポリシー（権限プリセット強制） | 細粒度 ABAC |
| 監査ログへの `sub` / `org_id` 付与 | フル SCIM プロビジョニング |

## 推奨フロー（Electron）

1. アプリがシステムブラウザで IdP authorize URL を開く（PKCE `code_verifier`）
2. カスタム URL スキーム `codex-studio://auth/callback` で code を受け取る
3. Main Process が token endpoint で交換（refresh / access）
4. access token は OS 秘密ストア（既存 `secret-store`）へ。メモリ上のセッションに claims を載せる
5. API 呼び出し時は Bearer。期限切れは silent refresh、失敗時は再ログイン

## クレームとアプリ権限

| Claim | 用途 |
|-------|------|
| `sub` | ユーザー ID（監査） |
| `email` / `name` | UI 表示 |
| `org_id` / `groups` | チーム Rules・権限プロファイル選択 |
| カスタム `codex_role` | `readonly` / `coding` / `admin` マッピング |

IdP グループ → `AgentPermissions` プリセットのマッピングは組織設定ファイル（後述チーム Rules と同居）で定義する。

## セキュリティ要件

- PKCE 必須。Client secret をデスクトップに埋め込まない（public client）
- refresh token は Keychain / DPAPI のみ。Renderer へは渡さない
- トークン漏洩時の revoke 手順を運用 Runbook に含める
- オフライン時は最終ログインのキャッシュポリシー（最大 72h 等）を組織が設定可能にする

## 実装フェーズ案

1. **設計確定**（本稿）— IdP PoC 1 社
2. **デスクトップ OIDC** — ログイン UI + secret-store
3. **ポリシー同期** — 組織 JSON を起動時に取得し権限を上書き
4. **クラウド Agent** — 同一 Issuer でサービス間トークン（[09-PhaseD](./09-PhaseD-設計ゲート.md)）

## 未決事項

- デバイスバインディングの要否
- 個人 API キーと SSO セッションの併存ルール
- 政府系など PKCE 非対応 IdP の例外経路
