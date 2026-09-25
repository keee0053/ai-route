# ekz（AIルート）

Harinezumi AI Hack (2026/09/20 - 09/27) のチーム開発リポジトリ。

## これは何か

Googleマップで調べたルートを共有すると、ルート沿いの寄り道先を AI が選んで、
経由地つきのルートにして Googleマップで開けるアプリ。

- 希望(景色・カフェなど)と使える時間を選ぶ。希望は選ばなくてもよい(おまかせ)
- 出てきた経由地は差し替え・削除できる

## 構成

| フォルダ | 中身 | 担当 |
|---|---|---|
| `mobile/` | Expo アプリ(**最終成果物**) | eisuke |
| `server/` | Cloudflare Workers。Google Routes / Places・Gemini を呼ぶ。API キーはここだけ | prizm |
| `docs/API_CONTRACT.md` | `mobile` と `server` の境界(リクエスト/レスポンスの形) | 全員 |
| `android/` | 最初に作った Kotlin 版(試作)。**もう更新しない**。最終状態はタグ `kotlin-prototype` | - |

本番 API: https://ekz-server.prizmprograms.workers.dev (main の `server/` をデプロイしている)

## セットアップ

```bash
npm install
npm run mobile          # Expo を起動
npm run server:test     # サーバのテスト
```

サーバをローカルで動かす場合は `server/README.md` を見る。キーは `server/.dev.vars`(gitignore 済み)。
アプリにはキーを入れない。

## チームの決まりごと

- **`.env` は絶対にコミットしない。** 一度履歴に入ったキーは消えない
- **フロントに出る API キーには必ず制限をかける**(Google Cloud コンソールで HTTP リファラ制限 + API制限)
- 作業を始める前に `git pull --rebase`
- **同じファイルを2人で同時に触らない。** 担当を分ける
- **動かないコードを main に置かない**
- 3人なので main 直 push で可。PR レビューは必須にしない(遅くなるだけ)

## メンバー

- prizmPrograms
- ChoMeiKo
- keee0053
