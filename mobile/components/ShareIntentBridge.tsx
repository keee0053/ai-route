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
    const url = shareIntent.webUrl ?? extractUrl(shareIntent.text)
    if (url) {
      void receiveSharedUrl(url).finally(() => {
        resetShareIntent()
        router.replace('/')
      })
    }
  }, [hasShareIntent, receiveSharedUrl, resetShareIntent, shareIntent.text, shareIntent.webUrl])

  return null
}
