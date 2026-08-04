---
name: virtual-company
description: バーチャル会社（調査→社長判断→人間承認→実装）で案件を進める
---

# Virtual Company

案件を部署レビューし、社長承認のあと実装まで進めます。

## 手順

1. ユーザの案件説明を確認する
2. 次を実行する:

```text
/team virtual-company <案件の説明をそのまま>
```

3. パイプラインが進むと **社長承認** ポップアップが出る。ユーザに承認を促す
4. 承認後は実装部が変更する（個別のファイル承認も出る場合あり）
5. 結果と `.codex/teams/virtual-company/BOARD.md` を案内する

## ステージ

research → decide → await_approval → execute → done

差し戻し・見送りでは実装しない。
