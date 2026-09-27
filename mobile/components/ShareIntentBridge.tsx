import { useEffect } from 'react'
import { router } from 'expo-router'
import { useShareIntentContext } from 'expo-share-intent'
import { useRoute } from '@/context/RouteContext'

const extractUrl = (value: string | null | undefined) => value?.match(/https:\/\/[^\s]+/)?.[0]

export function ShareIntentBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()
  const { receiveSharedUrl } = useRoute()

  useEffect(() => {
    if (!hasShareIntent) return
    // webUrl はカンマで切れる(/dir/34.7,135.5/… が途中で終わる)ので、共有テキストから取り出すほうを優先する
    const sharedValue = extractUrl(shareIntent.text) ?? shareIntent.webUrl ?? shareIntent.text ?? ''
    // 読み込み(短縮 URL の展開で数秒〜10秒かかる)を待たずに最初の画面へ移り、そこで「確認中」を出す。
    // 待ってから移ると、その間ずっと前に開いていた画面が残って見える
    void receiveSharedUrl(sharedValue)
    resetShareIntent()
    // 前のルートの画面が戻る先に残らないように、積み重なった画面を全部閉じてから最初の画面へ
    if (router.canDismiss()) router.dismissAll()
    router.replace('/')
  }, [hasShareIntent, receiveSharedUrl, resetShareIntent, shareIntent.text, shareIntent.webUrl])

  return null
}
