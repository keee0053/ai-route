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
    void receiveSharedUrl(sharedValue).finally(() => {
      resetShareIntent()
      router.replace('/')
    })
  }, [hasShareIntent, receiveSharedUrl, resetShareIntent, shareIntent.text, shareIntent.webUrl])

  return null
}
