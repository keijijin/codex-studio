# β 安定性チェックリスト（α → β）

| 項目 | 内容 |
|------|------|
| 版 | 0.2（M0–M3） |
| 関連 | [α テスト計画](./alpha-test-plan.md) / [Must-Nice プラン](./21-Must-Nice開発プラン.md) / [release.md](./release.md) |

β 判定は「日常開発に使える」ことに加え、**配布・秘密情報・IDE 基盤**が揃っていること。

---

## 1. ゲート条件（すべて満たす）

### 1.1 固まらない・応答する

- [ ] 大きめリポジトリ（1 万ファイル前後）を開いても UI が数秒以上固まらない
- [ ] `dist` / `out` / `release` / `.app` が既定で Explorer・索引・監視から除外される
- [ ] Agent 長文ストリーム中に Renderer CPU が暴走しない（プレーンテキスト表示）
- [ ] 1 時間以上の連続利用でクラッシュしない

### 1.2 承認・権限

- [ ] AI パネルを閉じた状態でも Write 承認ダイアログが出る
- [ ] YOLO OFF で Write / Shell が必ず確認される
- [ ] Deny 時に分かりやすいメッセージが出る

### 1.3 gitignore / 検索

- [ ] `.gitignore` が Explorer / Watcher / Indexer / Glob / ワークスペース置換で尊重される
- [ ] 「ビルド成果物を表示」トグルで浅い一覧のみ出る

### 1.4 Git（Source Control）

- [ ] status / stage / unstage / commit が動く
- [ ] StatusBar のブランチ表示・確認付き checkout
- [ ] Agent の `GitStatus` ツールが結果を返す

### 1.5 コンテキスト・Plan・永続化

- [ ] `@folder` / `@codebase` がコンテキストに入る（トークン上限あり）
- [ ] Plan → 「Agent で実行」ハンドオフ
- [ ] 再起動後もセッションが復元される（`sessions.db`）
- [ ] 「履歴を圧縮」でメッセージ数が減る

### 1.6 秘密情報・更新・公証

- [ ] API キー保存後、`codex-studio.json` に平文キーが残らない（`secrets.enc.json` へ）
- [ ] パッケージ版で「更新を確認」がエラーなく完走する（更新なしでも可）
- [ ]（Secrets 設定時）公証済み `.dmg` が Gatekeeper で開く / `stapler validate` 成功

---

## 2. 回帰スモーク（毎回リリース前）

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e   # 可能なら
```

手動: Welcome → フォルダを開く → ファイル編集保存 → Ask 1 問 → Agent で Read → Source Control で status。

---

## 3. 既知の許容（β でも可）

- Git Diff 専用ビュー未実装（ファイル Open で代替）
- CLI は OS 秘密ストアを読めない（環境変数必須）
- 公証 Secrets 未設定の CI は署名なしビルド（α 継続）

---

## 4. 判定記録

| 日付 | 判定 | メモ |
|------|------|------|
| | □ β Go / □ 条件付き / □ No-Go | |
