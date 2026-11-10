# リリース手順

## ローカルでパッケージ作成

```bash
pnpm install
pnpm build
pnpm package:mac    # macOS .dmg + .zip（updater 用）
pnpm package:win    # Windows インストーラー
pnpm package:linux  # Linux AppImage + .deb
```

成果物は `release/` に出力されます。`latest-mac.yml` / `latest.yml` / `*.blockmap` も同梱されます（electron-updater 用）。

### Windows ローカルビルドの注意

`node-pty` は N-API の prebuild（`node_modules/node-pty/prebuilds/win32-x64/` など）を同梱しています。  
Visual Studio / Build Tools が無い環境でも、`electron-builder` は **ソース再ビルドを行わず**（`npmRebuild: false`）パッケージできます。

ネイティブモジュールをソースから再ビルドしたい場合のみ、[VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) に **「デスクトップ開発 with C++」** を入れてください。  
`postinstall` の `electron-rebuild` は失敗しても prebuild があれば続行します。

## GitHub Releases（自動）

1. 変更を `main` に push
2. バージョン tag を push

```bash
git tag v0.1.3
git push origin v0.1.3
```

3. `.github/workflows/release.yml` が macOS / Linux / Windows 向けビルドを実行し、**全プラットフォーム成功時のみ** GitHub Releases にアップロードします。
   - ビルド失敗時は Release は作成されません（空のリリースを防ぐため）
   - アップロード対象に `latest*.yml` / `.blockmap` / mac `.zip` を含め、アプリ内「更新を確認」が動くようにします

## 自動更新（electron-updater）

- アプリ: 起動約 15 秒後にバックグラウンド確認、または **ヘルプ → 更新を確認** / 設定の「更新を確認」
- 更新メタ: GitHub Releases 上の `latest-mac.yml`（mac）/ `latest.yml`（win）/ `latest-linux.yml`
- 開発モード（`electron-vite dev`）では更新チェックはスキップされます

## セキュリティ監査・パッケージ確認

- 本番依存の audit 分類: [28-audit-prod-triage.md](./28-audit-prod-triage.md)
- CI: unit（`tests/security` 含む）+ Playwright e2e を必須。packaged アプリの E2E は当面手動
- リリース前手動スモーク: `pnpm package:mac`（または該当 OS）後、成果物を起動し `window.codex` とフォルダオープンを確認

### 手動パッケージ起動スモーク（記録）

| 項目 | 記録 |
|------|------|
| 日付 | 2026-11-09 |
| OS / arch | macOS 27.2.0 / arm64 |
| Electron | 45.2.3（2026-11-09 更新後の再スモークは e2e 緑で代替確認） |
| 成果物 | `release/mac-arm64/CodexStudio.app`（`electron-builder --mac --publish never`） |
| 起動 | OK（メイン + sandboxed Renderer プロセス確認） |
| `window.codex` | OK（Playwright `executablePath` 起動で `invoke` 関数あり） |
| ワークスペース open | OK（`CODEX_E2E_WORKSPACE` → Explorer に `sample-workspace`） |
| 備考 | 署名なし（Developer ID なし）。Gatekeeper 警告あり得る。任意 OS の optional deps は pnpm10 で未同梱警告あり（arm64 mac 本体は動作） |

## Electron バージョン方針（S0 / 2026-11-09）

| 項目 | 内容 |
|------|------|
| 現状 | `electron@^45.2.3`（2026-11-09 に 35.x EOL から更新） |
| 補足 | `pnpm.overrides.node-abi=4.40.0` で `@electron/rebuild` が Electron 45 ABI を解決。`safeStorage` は async API（`isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`）を使用 |
| 方針 | stable の現行メジャー（45.x）を追従。パッチは随時 |
| 更新条件 | (1) `pnpm test` + e2e 緑 (2) `pnpm package:mac` 起動スモーク (3) Terminal / safeStorage / updater 動作確認 |

## コード署名・公証

### 現状（checklist と一致）

- Release CI（`.github/workflows/release.yml`）は `CSC_LINK` があるとき署名を有効化し、mac では `APPLE_*` があるとき `notarize=true` を付与する
- Secrets 未設定時は `CSC_IDENTITY_AUTO_DISCOVERY=false` の **署名なし** ビルド（α/β 配布可、Gatekeeper 警告あり）
- ローカル `electron-builder.json` の `mac.notarize` 既定は `false`（Secrets / 明示フラグでのみ公証）

### macOS

以下の GitHub Secrets を設定すると、Release CI が署名＋公証（`notarize=true`）を試みます。

| Secret | 内容 |
|--------|------|
| `APPLE_ID` | Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 用パスワード |
| `APPLE_TEAM_ID` | Team ID |
| `CSC_LINK` | Developer ID 証明書（base64） |
| `CSC_KEY_PASSWORD` | 証明書パスワード |

Secrets 未設定時は署名なしビルド（`CSC_IDENTITY_AUTO_DISCOVERY=false`）になります。

#### ローカルで公証を有効にする

```bash
export APPLE_ID=...
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=...
export CSC_LINK=...          # またはキーチェーンの Developer ID
export CSC_KEY_PASSWORD=...
pnpm build
pnpm exec electron-builder --mac --publish never -c.mac.notarize=true
```

#### 検証

```bash
# Gatekeeper
spctl --assess --type execute -vv "release/mac/Codex Studio.app"

# Staple
xcrun stapler validate "release/mac/Codex Studio.app"
# または dmg
xcrun stapler validate release/*.dmg
```

### Windows

| Secret | 内容 |
|--------|------|
| `CSC_LINK` | コードサイニング証明書 |
| `CSC_KEY_PASSWORD` | パスワード |

## API キーと OS 秘密ストア

デスクトップアプリは起動時に Electron `safeStorage`（macOS Keychain / Windows DPAPI / Linux libsecret）へ API キーを移行します。  
平文は `codex-studio.json` から除去され、暗号文は `userData/secrets.enc.json` に保存されます。

**CLI（`pnpm cli`）** は OS 秘密ストアを読めません。移行後は環境変数 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` を設定してください。

## E2E テスト

```bash
pnpm test:e2e
```

`CODEX_E2E_MOCK_CHAT=1` により API キーなしでチャット送信テストが可能です。
