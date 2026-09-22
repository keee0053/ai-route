import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react'
import type { GenerateRouteInput, GenerateRouteResponse, Preference, RoutePreview, TimeConstraint } from '@/types/route'
import { generateRoute, getRoutePreview } from '@/services/api'

const demoUrl = 'https://www.google.com/maps/dir/?api=1&origin=%E5%A4%A7%E9%98%AA%E9%A7%85&destination=%E7%A5%9E%E6%88%B8%E3%83%8F%E3%83%BC%E3%83%90%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89'

type RouteState = {
  googleMapsUrl: string
  preview: RoutePreview | null
  result: GenerateRouteResponse | null
  preferences: Preference[]
  freeText: string
  timeConstraint: TimeConstraint
  previewLoading: boolean
  error: string | null
  receiveSharedUrl: (url: string) => Promise<void>
  updatePreferences: (value: { preferences: Preference[]; freeText: string; timeConstraint: TimeConstraint }) => void
  createRoute: () => Promise<boolean>
  clearError: () => void
}

const RouteContext = createContext<RouteState | null>(null)

export function RouteProvider({ children }: PropsWithChildren) {
  const [googleMapsUrl, setGoogleMapsUrl] = useState(process.env.EXPO_PUBLIC_USE_DEMO_ROUTE === 'false' ? '' : demoUrl)
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [result, setResult] = useState<GenerateRouteResponse | null>(null)
  const [preferences, setPreferences] = useState<Preference[]>(['ocean', 'cafe'])
  const [freeText, setFreeText] = useState('')
  const [timeConstraint, setTimeConstraint] = useState<TimeConstraint>({ type: 'none' })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const receiveSharedUrl = useCallback(async (url: string) => {
    setGoogleMapsUrl(url)
    setPreviewLoading(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await getRoutePreview(url))
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof Error ? caught.message : '共有ルートを確認できませんでした。')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const updatePreferences = useCallback((value: { preferences: Preference[]; freeText: string; timeConstraint: TimeConstraint }) => {
    setPreferences(value.preferences)
    setFreeText(value.freeText)
    setTimeConstraint(value.timeConstraint)
  }, [])

  const createRoute = useCallback(async () => {
    if (!googleMapsUrl) {
      setError('Google Mapsからルートを共有してください。')
      return false
    }
    setError(null)
    try {
      const input: GenerateRouteInput = { googleMapsUrl, preferences, freeText, timeConstraint }
      setResult(await generateRoute(input))
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ルートを作成できませんでした。')
      return false
    }
  }, [freeText, googleMapsUrl, preferences, timeConstraint])

  const value = useMemo<RouteState>(() => ({
    googleMapsUrl,
    preview,
    result,
    preferences,
    freeText,
    timeConstraint,
    previewLoading,
    error,
    receiveSharedUrl,
    updatePreferences,
    createRoute,
    clearError: () => setError(null),
  }), [createRoute, error, freeText, googleMapsUrl, preferences, preview, previewLoading, receiveSharedUrl, result, timeConstraint, updatePreferences])

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
}

export function useRoute() {
  const context = useContext(RouteContext)
  if (!context) throw new Error('useRoute must be used inside RouteProvider')
  return context
}
