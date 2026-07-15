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

## GitHub Releases（自動）

1. 変更を `main` に push
2. バージョン tag を push

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. `.github/workflows/release.yml` が macOS / Linux / Windows 向けビルドを実行し、GitHub Releases にアップロードします。

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
