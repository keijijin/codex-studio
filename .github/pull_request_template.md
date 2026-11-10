## Summary

-

## Test plan

- [ ] `pnpm test` / relevant unit tests
- [ ] Manual or E2E smoke if UI/main/preload changed

## Security checklist（該当時）

セキュリティ・権限・パス・IPC・preload に触れた場合はすべて確認する。

- [ ] preload は CJS（`.cjs`）のまま / `sandbox: true` と矛盾しない
- [ ] ファイル I/O は `resolveWithinWorkspace` または `WorkspaceFs` 経由（直接 `fs` 書き込みなし）
- [ ] 承認が必要なツールは `ask` で必ず preview → 承認 → apply
- [ ] 信頼境界（hooks / agent.env / workspace Skills）を弱めていない
- [ ] E2E: `window.codex` と `workspace:open` が通る（該当変更時）

参照: [docs/27-セキュリティ改善-WBS-ToDo.md](../docs/27-セキュリティ改善-WBS-ToDo.md)
