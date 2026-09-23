# ekz-server

Cloudflare Workers。**APIキーは全部ここにある。アプリ側には1本も持たせない。**

本番: `https://ekz-server.prizmprograms.workers.dev`

## エンドポイント

| | 内容 |
|---|---|
| `POST /generate-route` | 希望条件から経由地を選び、正確なルートを生成 |
| `POST /edit-route` | 経由地の変更・削除後にルートを再計算 |
| `POST /search` | `{origin, destination, genre?}` → ルートと沿線の候補 |
| `POST /tag` | `{candidate}` → その場所のタグを Gemini が10個生成 |
| `POST /next` | `{candidates, request?, badTags?, goodTags?, notes?}` → 次の1件を Jev が選ぶ |
| `GET /photo?name=places/...` | Places の写真を中継(キーを端末に出さないため) |

## Expo向け統合API

`POST /generate-route`と`POST /edit-route`の入力、出力、単位、エラー形式は
[`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md)を正式仕様とする。候補検索・選定・タグ生成と、
経由地込みのRoutes API再計算をサーバー内でまとめて行う。

## 使っているAPI

| | 用途 | 備考 |
|---|---|---|
| Routes API | ルートとポリライン | |
| Places API (New) | Search Along Route + 口コミ + 写真 | 口コミを取ると最上位ティア |
| **Gemini** `gemini-3.1-flash-lite` | タグ生成 | **3.8-flash は無料枠が1日20回。使わない** |
| **TypeSafe Jev** | 次の1件の選択 | テキストは作れないが速い(0.3秒) |

## セットアップ

```bash
npm install
npx wrangler login
```

キーはリポジトリに置かない。**シークレットとして登録する。**

```bash
npx wrangler secret put GOOGLE_MAPS_SERVER_KEY
npx wrangler secret put TYPESAFE_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

ローカルで動かすときは `server/.dev.vars`(gitignore 済み)に同じ3つを書く。

```bash
npx wrangler dev      # http://127.0.0.1:8787
npx wrangler deploy   # 本番へ
npx wrangler tail     # ログ
```

## キャッシュ

| 対象 | 期間 | 理由 |
|---|---|---|
| `/search` の結果 | 6時間 | Places の口コミ込みは無料枠 1,000回/月。同じルートを何度も試すので必須 |
| `/tag` の結果 | 7日 | Gemini の無料枠が狭い。同じ場所は二度と生成しない |
| `/photo` | 1日 | |

**デモ前に `node ../warm-cache.mjs` を実行してキャッシュを温めること。**
当日 Gemini や Places が落ちても、温めたルートは影響を受けない。

## 詰まりどころ

- **Windows のシェルから日本語を含む JSON を curl に渡すと化ける。**
  `--data-binary @file.json`(UTF-8で書き出したファイル)を使う。
  これで「候補が3件しか返らない」と長時間悩んだ
- **Gemini のキーは Cloud Console では作れない。** Agent Platform は
  「組織のセキュリティポリシーで APIキーが許可されていません」と出る。
  組織に属していなくても同じ。`https://aistudio.google.com/apikey` で作る
- **Gemini のレスポンスは `steps[].type === "model_output"` の中**。
  形が揺れるのでパスを決め打ちせず再帰的に探している
- **Places は1クエリで7〜20件しか返らない。** ジャンルごとに3〜4本投げて件数を確保する
- **候補の質は口コミ数と評価で絞る**(30件以上・3.8以上)。
  これが無いと住宅街の小さな公園が上位に来る
