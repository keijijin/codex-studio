# リリース手順

## ローカルでパッケージ作成

```bash
pnpm install
pnpm build
pnpm package:mac    # macOS .dmg
pnpm package:win    # Windows インストーラー
pnpm package:linux  # Linux AppImage + .deb
```

成果物は `release/` に出力されます。

### Windows ローカルビルドの注意

`node-pty` は N-API の prebuild（`node_modules/node-pty/prebuilds/win32-x64/` など）を同梱しています。  
Visual Studio / Build Tools が無い環境でも、`electron-builder` は **ソース再ビルドを行わず**（`npmRebuild: false`）パッケージできます。

ネイティブモジュールをソースから再ビルドしたい場合のみ、[VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) に **「デスクトップ開発 with C++」** を入れてください。  
`postinstall` の `electron-rebuild` は失敗しても prebuild があれば続行します。

## GitHub Releases（自動）

1. 変更を `main` に push
2. バージョン tag を push

```bash
git tag v0.1.2
git push origin v0.1.2
```

3. `.github/workflows/release.yml` が macOS / Linux / Windows 向けビルドを実行し、**全プラットフォーム成功時のみ** GitHub Releases にアップロードします。
   - ビルド失敗時は Release は作成されません（空のリリースを防ぐため）

## コード署名・公証（任意）

### macOS

以下の GitHub Secrets を設定し、`electron-builder.json` の `mac.notarize` を `true` に変更します。

| Secret | 内容 |
|--------|------|
| `APPLE_ID` | Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 用パスワード |
| `APPLE_TEAM_ID` | Team ID |
| `CSC_LINK` | Developer ID 証明書（base64） |
| `CSC_KEY_PASSWORD` | 証明書パスワード |

### Windows

| Secret | 内容 |
|--------|------|
| `CSC_LINK` | コードサイニング証明書 |
| `CSC_KEY_PASSWORD` | パスワード |

Secrets 未設定時は CI が `CSC_IDENTITY_AUTO_DISCOVERY=false` で署名なしビルドを行います。

## E2E テスト

```bash
pnpm test:e2e
```

`CODEX_E2E_MOCK_CHAT=1` により API キーなしでチャット送信テストが可能です。
