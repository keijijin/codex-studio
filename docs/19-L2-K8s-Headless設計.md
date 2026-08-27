# L2 — K8s Headless 設計

| 項目 | 内容 |
|------|------|
| 文書名 | L2 K8s Headless 設計 |
| 版 | 0.1 |
| 作成日 | 2026-08-06 |
| ステータス | Planned |
| 関連 | [将来プラン](./14-LINE-K8sエージェント将来プラン.md) / [Headless](./09-ヘッドレス実行プラン.md) / [ToDo](./07-TODOリスト.md) |

---

## 1. 目的

Codex Studio の **Headless Runner**（`packages/agent-core`）を Kubernetes 上で動かし、Desktop なしでも Workspace を処理できるようにする。  
L2 では **LINE 双方向は必須にしない**（ジョブ投入は CLI / API / Cron）。LINE 連携は L3。

### 完了条件

1. コンテナイメージがビルド・起動できる  
2. K8s Job（または Deployment + キュー）で 1 タスクを実行できる  
3. 成果物（ログ・差分サマリ）を PVC / Object Storage に出せる  
4. 権限は **readonly または coding** を明示（yolo は既定オフ）  

---

## 2. アーキテクチャ

```
Trigger (CLI / Cron / API)
  → K8s Job
    → container: codex-studio-headless
      → pnpm / node headless-runner
        → workspace PVC or git clone
        → LLM API（外向き HTTPS）
        → 結果: stdout JSON + /out artifacts
```

```
オプション A（推奨・最初）: Job 1 タスク 1 Pod
オプション B（後続）: Deployment + Redis/Queue ワーカー
```

L2-A は **Job 方式** に固定する。常時待機ワーカーはコストと運用が増えるため L2-B。

---

## 3. コンテナイメージ

### 3.1 ベース

- Node **20.19+**（electron-builder / 依存の engines に合わせる）  
- git / ca-certificates  
- 任意: ffmpeg（動画パイプラインを Headless で使う場合）  

### 3.2 エントリ

```bash
node packages/agent-core/dist/headless-cli.js \
  --workspace /workspace \
  --prompt "$PROMPT" \
  --permission-mode coding \
  --out /out/result.json
```

（実際の CLI パスは実装時に `package.json` bin と揃える。）

### 3.3 環境変数

| 変数 | 用途 |
|------|------|
| `OPENAI_API_KEY` / provider keys | LLM |
| `CODEX_WORKSPACE` | マウントパス |
| `CODEX_PERMISSION_MODE` | readonly / coding / yolo |
| `CODEX_PERSONA` | sticky Persona（任意） |
| `CODEX_GLOBAL_PERSONAS_DIR` | 任意 |

Secrets は K8s Secret。イメージにキーを焼かない。

---

## 4. K8s マニフェスト（骨子）

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: codex-headless-sample
spec:
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: agent
          image: ghcr.io/example/codex-studio-headless:latest
          envFrom:
            - secretRef:
                name: codex-llm-secrets
          env:
            - name: CODEX_PERMISSION_MODE
              value: coding
            - name: PROMPT
              value: "リポジトリの README を要約して /out/summary.md に書いて"
          volumeMounts:
            - name: workspace
              mountPath: /workspace
            - name: out
              mountPath: /out
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: codex-workspace
        - name: out
          emptyDir: {}
```

本番では `PROMPT` を ConfigMap / Job 生成時の引数に置き、結果 PVC を別途マウントする。

---

## 5. Workspace 供給

| 方式 | 用途 | メモ |
|------|------|------|
| PVC | 継続プロジェクト | Desktop と共有しない前提で単一ライター |
| git clone initContainer | 使い捨て Job | SHA 固定推奨 |
| サイドカー sync | 双方向 | L2 では非推奨（複雑） |

L2-A は **git clone（initContainer）または単一 PVC** のどちらか一方から始める。

---

## 6. 権限・安全

- 既定: `coding`（Write 可・危険コマンドは承認相当で拒否）  
- `yolo` は Job アノテーション明示時のみ  
- NetworkPolicy: LLM API / git / 必要レジストリ以外は拒否（可能な環境で）  
- コンテナは非 root 推奨  
- Desktop の Approval UI は無い → **自動拒否ルールを厳しく**（deny list を Headless に共有）

---

## 7. 成果物

| 成果物 | パス例 |
|--------|--------|
| 実行結果 JSON | `/out/result.json` |
| ログ | Pod logs + `/out/agent.log` |
| 生成ファイル | Workspace 内（git diff で回収） |

回収方法（L2-A）:

1. Job 完了後に `kubectl logs`  
2. 結果 PVC を別 Job で読む  
3.（任意）S3 互換へアップロードステップ  

---

## 8. 実装タスク（案）

| ID | 内容 | 依存 |
|----|------|------|
| L2-1 | Headless CLI の安定化（args / exit code / JSON） | agent-core |
| L2-2 | Dockerfile + ローカル `docker run` 検証 | L2-1 |
| L2-3 | Job マニフェストサンプル（`deploy/k8s/`） | L2-2 |
| L2-4 | Secret / permission ドキュメント | docs |
| L2-5 | CI でイメージビルド（任意） | L2-2 |

---

## 9. 非目標（L2）

- LINE Webhook / 双方向  
- Desktop UI からの K8s ジョブ投入 UI  
- マルチテナント課金・クォータ  
- GPU 動画生成の本番スケール  

---

## 10. 受け入れテスト

1. ローカル Docker で Headless が README 要約を書く  
2. Kind / 実クラスタで Job が Completed  
3. `/out/result.json` に success と要約がある  
4. `readonly` で Write が失敗し、Job が期待どおり非ゼロ or success:false  

---

## 11. L3 への接続点

L3（LINE フルエージェント）は次を追加する:

- 公開 HTTPS Ingress → Webhook  
- キューワーカー（Deployment）  
- Flex 承認 → 一時的に coding/yolo  

L2 の Job / イメージはそのまま再利用する。

---

## 12. 決定ログ

| 日付 | 内容 |
|------|------|
| 2026-08-06 | L2-A は K8s Job + Headless コンテナ。双方向 LINE は L3。既定権限は coding。 |
