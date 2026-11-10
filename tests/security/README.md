# Security regression tests

レビュー PoC を CI で固定するためのディレクトリです。シナリオ ID は [26-セキュリティ改善設計書](../../docs/26-セキュリティ改善設計書.md) §10 に対応します。

| ID | ファイル | 概要 |
|----|----------|------|
| S-PATH-* | `path-symlink.test.ts` | symlink 親・dangling・Delete リンク自身 |
| S-HOOK-* | `hooks-injection.test.ts` | Hooks プレースホルダ注入耐性 |
| S-TEAM-01 | `team-approval.test.ts` | Team が requiresApproval |
| S-ENV-01 | `agent-env.test.ts` | agent.env の PATH/BASH_ENV 除外 |
| S-MEM-01 | `memory-symlink.test.ts` | MemoryAppend / memory の symlink 脱出 |
| S-FS-01 | `workspace-fs.test.ts` | WorkspaceFs 単一入口 |

既存の `tests/resolve-path-symlink.test.ts` / `tests/hooks.test.ts` も同系統をカバーします。ここはゲート用の最短セットです。
