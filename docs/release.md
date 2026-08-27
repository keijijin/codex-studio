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

## コード署名・公証

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
