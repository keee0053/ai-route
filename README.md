# AIルート

<p align="center">
  <img src="./mobile/assets/icon/icon.png" alt="AIルートのアプリアイコン" width="120" />
</p>

<p align="center">
  Google Mapsで作ったルートに、AIが好みと時間に合う寄り道を提案するモバイルアプリ。
</p>

<p align="center">
  <a href="https://github.com/keee0053/ai-route/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/keee0053/ai-route/actions/workflows/ci.yml/badge.svg" />
  </a>
  <img alt="Expo" src="https://img.shields.io/badge/Expo-57-000020?logo=expo" />
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" />
</p>

## アプリの概要

移動を「最短で目的地へ行く手段」だけではなく、道中も楽しめる体験に変えることを目指しました。

Google Mapsのルートを共有し、「景色」「カフェ」「グルメ」などの希望と寄り道に使える時間を選ぶと、ルート周辺の実在する候補からAIが経由地を選びます。結果は自由に編集し、完成したルートをGoogle Mapsで開けます。

## ユーザーフロー

1. Google Mapsで出発地と目的地を設定
2. ルートをAIルートへ共有、またはURLを貼り付け
3. 楽しみたいテーマと使える時間を選択
4. AIがルート沿いの経由地を提案
5. 経由地を追加・差し替え・削除
6. Google Mapsでナビを開始

## 主な機能

- Google Mapsの共有Intentからルートを取り込み
- Google Maps URLの手入力・クリップボード貼り付け
- 好み、自由入力、時間、移動手段によるルート生成
- Google Routes APIとPlaces APIによるルート・実在地点の取得
- Geminiを使った候補のタグ付けと選定
- 経由地の追加・差し替え・削除
- 経由地と所要時間を反映した地図・タイムライン
- 完成ルートのGoogle Maps起動

## 担当範囲

このプロジェクトは3名のチームで開発しました。私は主に次を担当しました。

- React Native + Expo + TypeScriptによるモバイルアプリのUI実装
- Google Maps取り込みからルート生成・編集までのユーザーフロー設計
- Google Maps共有受信と手動URL取り込み画面
- 希望入力、時間設定、結果表示、経由地編集のUI / UX
- バックエンドAPIとフロントエンドのデータ接続・エラー表示
- Android実機での動作確認

Gitの履歴に共同開発者と各人のコミットを残しています。

## 技術構成

```text
React Native / Expo
        |
        | HTTPS
        v
Cloudflare Workers
        |
        +-- Google Routes API
        +-- Google Places API (New)
        +-- Gemini API
```

| 領域 | 技術 |
|---|---|
| Mobile | React Native, Expo, Expo Router, TypeScript |
| Backend | Cloudflare Workers, Hono, TypeScript |
| AI | Gemini |
| Maps | Google Routes API, Places API (New), Google Maps URLs |
| Test | Vitest, TypeScript typecheck, Android実機 |

## ディレクトリ構成

| フォルダ | 内容 |
|---|---|
| `mobile/` | Expoで実装した最終版モバイルアプリ |
| `server/` | Cloudflare WorkersのAPI |
| `docs/API_CONTRACT.md` | フロントエンドとAPIのデータ契約 |
| `android/` | 初期のKotlinプロトタイプ |

## ローカル起動

```bash
npm install
cp mobile/.env.example mobile/.env
npm run mobile
```

バックエンドをローカル起動する場合は、`server/README.md`を参照してください。APIキーはリポジトリに含めていません。

```bash
npm run mobile:typecheck
npm run server:test
```

## チーム開発について

- 開発元: [prizmPrograms/ekz](https://github.com/prizmPrograms/ekz)
- 開発メンバー: [prizmPrograms](https://github.com/prizmPrograms), [ChoMeiKo](https://github.com/ChoMeiKo), [keee0053](https://github.com/keee0053)
- 開発期間: Harinezumi AI Hack 2026/09/20 - 2026/09/27

このリポジトリは、チームの許可を得てポートフォリオ用に複製したものです。チーム開発であることと、共同開発者の履歴が分かる形で公開しています。

## 注意事項

- APIキーと本番環境のシークレットは公開していません。
- 公開中のバックエンドは予告なく停止する場合があります。
- ソースコードの再利用条件は別途メンバー間での合意が必要です。
