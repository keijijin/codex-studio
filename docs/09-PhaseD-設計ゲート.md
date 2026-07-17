# Phase D 設計ゲート：Teams / Cloud / Remote

| 項目 | 内容 |
|------|------|
| 版 | 1.0 |
| 日付 | 2026-07-17 |
| 関連 | [08-エージェント拡張プラン](./08-エージェント拡張プラン.md) |

## 1. 判断サマリー

| 領域 | 判断 | 理由 |
|------|------|------|
| **Local Agent Teams** | **実装する（本 Phase）** | Subagents / Skills / BOARD ファイルで Local-first のまま価値を出せる |
| **チーム共有 Skills** | **実装する（グローバルパス）** | `~/.codex-studio/skills` + ワークスペース Skills。追加インフラ不要 |
| **Cloud Execution（管理 VM）** | **見送り** | 課金・隔離・監査・テナント運用が製品化レベルのコスト。需要ゲート未達 |
| **Remote Control（ブラウザ遠隔）** | **見送り** | 認証・TLS・権限委譲の攻撃面が大きい。Local-first 方針と衝突しやすい |

## 2. 実装したもの（Local Teams）

- `.codex/teams/<id>/team.json` … 役割定義
- 共有ボード `.codex/teams/<id>/BOARD.md`
- CLI: `codex-studio team list` / `team run <id> "<task>"`
- Agent: `/team <id> …` および `Team` ツール
- 役割は読取中心（書込・Shell はチーム実行では禁止）

## 3. Cloud / Remote を再開する条件（ゲート）

次をすべて満たしたら設計レビューを再開する。

1. **需要**: 有料利用または社内導入の明確な要求（Issue / 顧客）が 3 件以上
2. **コスト**: VM / サンドボックスの月次予算と単価モデルが文書化されている
3. **セキュリティ**: 脅威モデル（秘密漏洩・RCE・テナント横断）と対策案がある
4. **運用**: 監査ログ・キルスイッチ・リージョン方針がある

## 4. 将来案（未実装）

### Cloud Execution（案）

- CLI に `--remote <endpoint>` を追加し、既存 `runHeadlessAgent` を API 経由で起動
- ワーカーはエフェメラルコンテナ。ワークスペースは git clone または artifact 同期
- 既定 Permission は `readonly`。書込は明示プロファイルのみ

### Remote Control（案）

- ローカル Main が短命トークン付き WebSocket を開く
- ブラウザはストリーム購読と承認 UI のみ。Shell は既定 deny
- 公開インターネット直結は禁止（トンネル or 社内 VPN）

## 5. 非目標の再確認

- Cursor 完全互換・Tab 補完との同時追従はしない
- Phase D でクラウド課金基盤を作らない
