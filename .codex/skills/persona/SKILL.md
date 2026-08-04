---
name: persona
description: Persona（声・優先順位）の使い方。具体的な適用は /persona <name> …
---

# Persona の使い方

Persona は Rules / Skills とは別レイヤで、口調と優先順位を固定します。

## 適用方法

```
/persona mentor この関数を説明して
/persona strict-reviewer この PR をレビューして
/persona minimal-coder 差分最小で直して
```

- 配置: `.codex/personas/<name>.md` または `~/.codex-studio/personas/`
- 設定の「既定 Persona」でも未指定時に適用できます
- Teams の `role.persona` で役割ごとに指定できます

## 同梱例

| 名前 | 用途 |
|------|------|
| strict-reviewer | 厳しいレビュー（Critical / Should / Nice） |
| mentor | 新人向けの丁寧な説明 |
| minimal-coder | 差分最小・説明少なめ |
| sales-dept / marketing-dept / legal-dept / eng-dept / ceo | バーチャル会社（`/team virtual-company`） |

ユーザの依頼に合う Persona を提案し、必要なら `/persona <name> …` の形で次の発話を示してください。
