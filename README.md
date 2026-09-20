# ekz

Harinezumi AI Hack (2026/09/20 - 09/27) のチーム開発リポジトリ。

## これは何か

(アイディア確定後に記入)

## セットアップ

```bash
npm install
cp .env.example .env   # .env に各自キーを入れる
npm run dev
```

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
