# Must Have / Nice to Have 開発プラン

| 項目 | 内容 |
|------|------|
| 文書名 | Must Have / Nice to Have 開発プラン |
| 版 | 1.0 |
| 作成日 | 2026-08-07 |
| ステータス | M0–M3 実装済（Nice / β 判定へ） |
| 関連 | [仕様書](./02-仕様書.md) / [ToDo](./07-TODOリスト.md) / [開発プラン](./05-開発プラン.md) / [操作マニュアル](./user/操作マニュアル.md) |

---

## 1. 目的

α（v0.1）でエージェント機能は厚い一方、**IDE としての日常利用・配布・安全**が手薄い。  
本プランはギャップ分析で挙げた Must / Nice を、依存関係つきの段階計画に落とす。

### 方針

| 方針 | 内容 |
|------|------|
| **IDE 基盤を先に** | Git・検索置換・分割・gitignore を Agent 拡張より優先 |
| **配布を止めない** | 公証・自動更新は Must 後半で並行 |
| **安全の最低線** | Keychain・履歴肥大対策を Must に含める |
| **Nice はフラグ** | MCP / Tab / セマンティック等は Feature Flag または別 Phase |
| **既存プランと重複しない** | LINE/K8s は [14](./14-LINE-K8sエージェント将来プラン.md)、メディア V2 は [12](./12-動画生成プラン.md)/[13](./13-プレゼン生成プラン.md) に委譲 |

### 非目標（本プランの外）

- Cursor / VS Code 拡張エコシステム完全互換
- クラウド Agent・SSO の本番インフラ同時構築
- 全言語 LSP の自前実装

---

## 2. ロードマップ概要

```
Phase M0  安定化・gitignore          （1〜2 週）
Phase M1  Git + 検索置換 + 分割      （3〜4 週）
Phase M2  コンテキスト・Plan・永続化 （2〜3 週）
Phase M3  配布・更新・Keychain       （2〜3 週）
────────────────────────────────────────
Phase N1  MCP                        （2〜3 週）
Phase N2  Tab 補完 + LSP 基礎        （3〜4 週）
Phase N3  セマンティック検索         （2〜3 週）
Phase N4  UX ポリッシュ              （1〜2 週）
Phase N5  エンタープライズ種まき     （随時）
```

**マイルストーン**

| ID | 時期目安 | 完了の姿 |
|----|----------|----------|
| β-1 | M0+M1 完了 | 自リポジトリを Git 付きで日常開発できる |
| β-2 | M2+M3 完了 | 公証付き配布 + 自動更新 + 鍵の安全保存 |
| γ | N1+N2 | MCP と Tab で「Cursor に近い」体験の一部 |

---

## 3. Must Have — 詳細計画

### M0 — 安定化と `.gitignore`（前提）

| ID | 成果 | 完了条件 | 主な変更箇所 |
|----|------|----------|--------------|
| M0-1 | 索引・Explorer・Watcher・Glob が `.gitignore`（＋既定 ignore）を尊重 | node_modules / dist / release 等が既定で除外。明示オプトインで表示可 | `workspace.ts` / `file-watcher.ts` / `indexer` / `glob` |
| M0-2 | 重いディレクトリの浅走査維持・強化 | `.app` / `release` 等で UI が固まらない回帰テスト | workspace / watcher（既存対策の文書化＋テスト） |
| M0-3 | ストリーム中 Markdown/Mermaid 負荷対策の回帰 | Agent 長文＋ mermaid で Renderer CPU 暴走しない | MessageList / MarkdownRenderer |
| M0-4 | 承認ダイアログ常時表示の回帰 | AI パネル閉でも Write 承認できる | Layout / app-store |

**依存**: なし（最初にやる）  
**リスク**: ignore 規則が厳しすぎてユーザー成果物が見えない → 設定で「ビルド成果物を表示」トグル

---

### M1 — Git / 検索置換 / 分割ペイン

#### M1-A Git 連携（最優先）

| ID | 成果 | 完了条件 |
|----|------|----------|
| M1-A1 | サイドバー Source Control（変更一覧） | `git status` 相当。クリックで Diff |
| M1-A2 | ステージ / アンステージ / コミット | メッセージ入力＋ commit。hooks 失敗を UI 表示 |
| M1-A3 | ブランチ表示・簡易切替 | StatusBar に branch。checkout は確認付き |
| M1-A4 | Agent 向け Git コンテキスト | 変更ファイル一覧を Agent system / Tool から参照可（任意 Tool `GitStatus`） |
| M1-A5 | 危険操作のガード | force push / hard reset は既定 deny または強確認 |

**技術案**: `simple-git` または `git` CLI ラップ（Main）。Renderer は IPC。  
**非目標（M1）**: PR 作成 UI、マージコンフリクトエディタ、GitHub 認証フル統合

#### M1-B ワークスペース検索・置換

| ID | 成果 | 完了条件 |
|----|------|----------|
| M1-B1 | ファイル内 Find / Replace（Monaco） | Cmd/Ctrl+F / H |
| M1-B2 | ワークスペース Grep UI 強化 | 既存 SearchPanel にプレビュー・件数・除外 |
| M1-B3 | ワークスペース Replace（確認付き） | マッチ一覧 → 選択適用。gitignore 尊重 |

#### M1-C エディタ分割

| ID | 成果 | 完了条件 |
|----|------|----------|
| M1-C1 | 左右（または上下）2 ペイン | タブをペイン間移動可能 |
| M1-C2 | アクティブペインに Open / Agent Diff 連携 | Diff 適用先が明確 |

**依存**: M0（巨大ツリーでの Git status 爆発を避ける）  
**Dogfood**: M1 完了後、本リポジトリ開発を Codex Studio に寄せる

---

### M2 — コンテキスト・Plan・永続化

| ID | 成果 | 完了条件 |
|----|------|----------|
| M2-1 | `@folder` 添付 | フォルダ配下の要約 or ファイル一覧＋主要ファイル抜粋をコンテキスト化（トークン上限付き） |
| M2-2 | `@codebase`（キーワード版） | ripgrep / 索引で関連ファイルを自動ピック。セマンティックは N3 |
| M2-3 | Plan モード | ツールなし or 読取のみで手順書を出し、ユーザー承認後に Agent へ渡せる |
| M2-4 | セッション DB 移行（SQLite） | electron-store の messages 肥大を解消。移行スクリプト付き |
| M2-5 | 履歴コンパクション強化 | 巨大 tool result の永続時トリム。UI に「履歴を圧縮」 |

**依存**: M0（@folder が ignore を見ること）、既存 Compact / Ask・Agent  
**リスク**: @codebase のトークン爆発 → 硬めの予算とプレビュー

---

### M3 — 配布・更新・秘密情報

| ID | 成果 | 完了条件 |
|----|------|----------|
| M3-1 | API キーを OS 秘密ストアへ | macOS Keychain / Windows Credential / libsecret。移行パスあり |
| M3-2 | electron-updater | 起動時または手動「更新を確認」。GitHub Releases 連携 |
| M3-3 | macOS 公証・staple | ダウンロードした .dmg が Gatekeeper で素直に開く |
| M3-4 | リリース手順書更新 | [release.md](./release.md) に公証・updater 手順を追記 |
| M3-5 | 安定性チェックリスト | α→β 判定用（固まり・承認・ignore・Git） |

**依存**: 既存 electron-builder / GH Releases  
**リスク**: 公証アカウント・証明書。ブロッカーなら「署名のみ」を中間成果に

---

## 4. Nice to Have — 詳細計画

### N1 — MCP クライアント

| ID | 成果 | 完了条件 |
|----|------|----------|
| N1-1 | `packages/mcp-client`（stdio） | 外部 MCP を起動し tool list 取得 |
| N1-2 | Tool Registry 統合 | Agent から MCP ツール呼び出し。権限カテゴリ `network` or 新 `mcp` |
| N1-3 | 設定 UI | サーバー一覧・有効/無効・env |
| N1-4 | （任意）SSE / HTTP トランスポート | |

**依存**: 安定した Permission / 承認 UI（既存）  
**詳細は既存 Post-MVP バックログを本 Phase に昇格**

---

### N2 — Tab 補完 + LSP 基礎

| ID | 成果 | 完了条件 |
|----|------|----------|
| N2-1 | Inline completion Provider | デバウンス・キャンセル・コスト上限 |
| N2-2 | Ghost text UI | Tab で受理、Esc で破棄 |
| N2-3 | 言語サーバー接続（1〜2 言語） | 例: TypeScript。定義ジャンプ・診断を StatusBar / Problems |
| N2-4 | Agent との干渉ルール | 補完中は Agent ストリームとフォーカス競合しない |

**依存**: M3（コスト意識）、ルーティング設定  
**非目標**: 全言語 LSP・Copilot 互換プロトコル

---

### N3 — セマンティック検索

| ID | 成果 | 完了条件 |
|----|------|----------|
| N3-1 | チャンク＋ Embedding パイプライン | 増分更新、gitignore 尊重 |
| N3-2 | ローカルベクトルストア | sqlite-vss または等価 |
| N3-3 | `@codebase` semantic モード | M2 のキーワード版と切替 |
| N3-4 | 初回索引 UX | 進捗・キャンセル・ディスク使用量表示 |

**依存**: M0, M2-2  

---

### N4 — UX ポリッシュ

| ID | 成果 | 完了条件 |
|----|------|----------|
| N4-1 | ライトテーマ | 仕様 FR-CF-05。トークンで切替 |
| N4-2 | キーバインド設定 | 主要コマンドの変更・表示 |
| N4-3 | マルチルートワークスペース | 仕様 FR-WS-02 |
| N4-4 | チャット画像添付 | ビジョン対応モデル時のみ |
| N4-5 | メディア V2 フック | 進捗 UI 等は [12](./12-動画生成プラン.md) / [13](./13-プレゼン生成プラン.md) に従う |

---

### N5 — エンタープライズ種まき（将来）

| ID | 成果 | 完了条件 |
|----|------|----------|
| N5-1 | 集中監査ログのエクスポート | JSONL 既存を強化 |
| N5-2 | SSO / OIDC 設計書 | 実装は需要ゲート後 |
| N5-3 | チーム Rules 共有設計 | |
| N5-4 | クラウド Agent | [09 Phase D ゲート](./09-PhaseD-設計ゲート.md) 継承 |
| N5-5 | LINE / K8s | [14](./14-LINE-K8sエージェント将来プラン.md) に委譲（L1〜） |

---

## 5. 横断品質ゲート（各 Phase 共通）

各 Must Phase の完了時に最低限:

1. `pnpm test` / 関連ユニット緑  
2. 手動: 中規模リポジトリ（本 repo）で固まりなし  
3. セキュリティ: 新 IPC に入力検証  
4. ドキュメント: 操作マニュアル該当節を更新  
5. Feature Flag: 未完成 UI を既定オフ  

---

## 6. 工数感（1 人換算の目安）

| Phase | 目安 |
|-------|------|
| M0 | 1〜2 週 |
| M1 | 3〜4 週 |
| M2 | 2〜3 週 |
| M3 | 2〜3 週（公証待ちで延びうる） |
| N1 | 2〜3 週 |
| N2 | 3〜4 週 |
| N3 | 2〜3 週 |
| N4 | 1〜2 週 |
| N5 | 設計中心・随時 |

合計 Must: **約 8〜12 週** → β 候補。  
Nice は並行・需要次第。

---

## 7. 優先順位の決め方（迷ったとき）

1. 自分たちが毎日使うか（Dogfooding）  
2. 仕様書の Must か  
3. セキュリティ／配布ブロッカーか  
4. Agent の差別化か（後回し可）  

**例**: Tab 補完より Git を先。MCP より Keychain を先。

---

## 8. 決定ログ

| 日付 | 内容 |
|------|------|
| 2026-08-07 | Must/Nice ギャップを本プラン化。ToDo Phase M / N を追加。 |
| 2026-08-07 | LINE/K8s・メディア V2・Cloud は既存プランへ委譲し重複実装しない。 |
