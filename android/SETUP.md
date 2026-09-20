# セットアップ

## 必要なもの

- **Android Studio**(同梱の JDK を使うので別途 JDK は不要)
- **SDK Platform 37.2** と **Build-Tools 37.0.0**
  - SDK Manager から入れる。`compileSdk = 37 / compileSdkMinor = 2`
  - AndroidX の新しい依存が compileSdk 37 以上を要求するため、36 では**ビルドが通らない**

## 最初にやること

`android/local.properties` を自分で作る(gitignore 済み)。

```properties
sdk.dir=D:/android-sdk
```

**パスはスラッシュ区切りで書くこと。** `D:\android-sdk` と書くと properties 形式で
`\a` がエスケープとして食われ、`Invalid file path` でビルドが落ちる。

## ビルド

```bash
./gradlew assembleDebug
```

APK は `app/build/outputs/apk/debug/app-debug.apk`。

## ハマりどころ

### AGP 9 では Kotlin プラグインを書かない

`org.jetbrains.kotlin.android` を plugins に書くと**ビルドが失敗する**。
AGP 9.0 から Kotlin サポートが組み込みになったため。

```kotlin
plugins {
    alias(libs.plugins.android.application)
    // alias(libs.plugins.kotlin.android)  ← 書かない
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}
```

### APIキー

- **`local.properties` に置く。** gitignore 済み
- **Anthropic のキーはアプリに入れない。** APK は逆コンパイルできる。サーバ(`../server`)経由にする
- Maps / Places のキーには **Androidアプリ制限(パッケージ名 + SHA-1)** を必ずかける

## 実機で動かす

USB デバッグ、または ワイヤレスデバッグ(設定 → 開発者向けオプション)。

```bash
adb pair   <ip>:<ペア設定ポート> <6桁コード>
adb connect <ip>:<接続ポート>
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**ペア設定ポートと接続ポートは別物。** 前者はダイアログ内、後者はトップ画面に出る。

## 現状

`MainActivity` は、Googleマップの共有シートから受け取ったリンクを表示するだけ。
共有シートへの登録は `AndroidManifest.xml` の `ACTION_SEND` intent-filter で済んでいる。

動作確認済み: 実機 SC-51E (Android 16 / API 36) で、共有リンクの受け取りを確認。
