# pnpm audit --prod 分類（2026-11-09）

| 項目 | 内容 |
|------|------|
| コマンド | `pnpm audit --prod` |
| 集計 | critical 4 / high 24 / moderate 27 / low 6（計 61） |
| 方針 | 配布ゲート（S0）: critical を優先判断。全件解消は非目標 |

## Critical

| パッケージ | 概要 | 判定 | 理由・次アクション |
|------------|------|------|-------------------|
| `simple-git` / `@simple-git/argv-parser` | VISUAL / trailer まわりの unsafe guard | **修正予定** | 直接依存。`simple-git@>=4.0.1` へ上げる（破壊的変更の確認後） |
| `proxy-addr`（via express / MCP SDK） | IPv4-mapped IPv6 trust spoofing | **許容（条件付き）** | デスクトップアプリ内のローカル MCP 経路。公開リバースプロキシ前面ではない。SDK 更新待ち |
| `dompurify`（via mermaid-cli） | SAFE_FOR_TEMPLATES bypass | **許容（条件付き）** | CLI/メディア生成の推移依存。Renderer の Mermaid は別経路。`mermaid` 更新で追随 |

## High（方針）

- Electron / Chromium 系はメジャー更新計画（S0 Electron 追従）に載せる
- 開発専用・テスト専用パスのみのものは本番影響外として許容し、依存ツリー更新時に再評価
- ユーザー入力をそのまま Shell / HTML に流す経路に効くものは個別チケット化

## U-3 決定（packaged E2E）

| 決定 | 内容 |
|------|------|
| CI 必須 | 当面は **dev/build + Playwright（現行 e2e）を必須** とする |
| パッケージ版 | リリース前の **手動スモーク**（`electron-builder` 成果物起動）を S0 チェックリストに残す。CI 必須化は runner コスト確定後に再検討 |

## 更新ルール

再監査したら本表の日付と判定を更新する。許容理由が消えたら判定を「修正予定」に戻す。
