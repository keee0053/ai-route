import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react'
import type { GenerateRouteInput, GenerateRouteResponse, Preference, RoutePreview, TimeConstraint, TravelMode } from '@/types/route'
import { ApiError, generateRoute, getRoutePreview } from '@/services/api'

const demoUrl = 'https://www.google.com/maps/dir/?api=1&origin=%E5%A4%A7%E9%98%AA%E9%A7%85&destination=%E7%A5%9E%E6%88%B8%E3%83%8F%E3%83%BC%E3%83%90%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89'

type RouteState = {
  googleMapsUrl: string
  preview: RoutePreview | null
  result: GenerateRouteResponse | null
  preferences: Preference[]
  freeText: string
  timeConstraint: TimeConstraint
  travelMode: TravelMode
  previewLoading: boolean
  routeLoading: boolean
  error: ApiError | null
  receiveSharedUrl: (url: string) => Promise<boolean>
  updatePreferences: (value: { preferences: Preference[]; freeText: string; timeConstraint: TimeConstraint; travelMode: TravelMode }) => void
  createRoute: () => Promise<boolean>
  updateResult: (value: GenerateRouteResponse) => void
  clearError: () => void
}

const RouteContext = createContext<RouteState | null>(null)

export function RouteProvider({ children }: PropsWithChildren) {
  const [googleMapsUrl, setGoogleMapsUrl] = useState(process.env.EXPO_PUBLIC_USE_DEMO_ROUTE === 'true' ? demoUrl : '')
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [result, setResult] = useState<GenerateRouteResponse | null>(null)
  const [preferences, setPreferences] = useState<Preference[]>([])
  const [freeText, setFreeText] = useState('')
  const [timeConstraint, setTimeConstraint] = useState<TimeConstraint>({ type: 'extra_time', minutes: 30 })
  const [travelMode, setTravelMode] = useState<TravelMode>('driving')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const receiveSharedUrl = useCallback(async (url: string) => {
    setGoogleMapsUrl(url)
    setPreviewLoading(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await getRoutePreview(url))
      return true
    } catch (caught) {
      setPreview(null)
      setError(toApiError(caught, '共有ルートを確認できませんでした。'))
      return false
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const updatePreferences = useCallback((value: { preferences: Preference[]; freeText: string; timeConstraint: TimeConstraint; travelMode: TravelMode }) => {
    setPreferences(value.preferences)
    setFreeText(value.freeText)
    setTimeConstraint(value.timeConstraint)
    setTravelMode(value.travelMode)
  }, [])

  const createRoute = useCallback(async () => {
    if (!googleMapsUrl) {
      setError(new ApiError('Google Mapsからルートを共有してください。', 'MAPS_URL_PARSE_FAILED'))
      return false
    }
    setRouteLoading(true)
    setError(null)
    setResult(null)
    try {
      const input: GenerateRouteInput = { googleMapsUrl, preferences, freeText, timeConstraint, travelMode }
      setResult(await generateRoute(input))
      return true
    } catch (caught) {
      setError(toApiError(caught, 'ルートを作成できませんでした。'))
      return false
    } finally {
      setRouteLoading(false)
    }
  }, [freeText, googleMapsUrl, preferences, timeConstraint, travelMode])

  const clearError = useCallback(() => setError(null), [])
  const updateResult = useCallback((value: GenerateRouteResponse) => setResult(value), [])

  const value = useMemo<RouteState>(() => ({
    googleMapsUrl,
    preview,
    result,
    preferences,
    freeText,
    timeConstraint,
    travelMode,
    previewLoading,
    routeLoading,
    error,
    receiveSharedUrl,
    updatePreferences,
    createRoute,
    updateResult,
    clearError,
  }), [clearError, createRoute, error, freeText, googleMapsUrl, preferences, preview, previewLoading, receiveSharedUrl, result, routeLoading, timeConstraint, travelMode, updatePreferences, updateResult])

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
}

export function useRoute() {
  const context = useContext(RouteContext)
  if (!context) throw new Error('useRoute must be used inside RouteProvider')
  return context
}

function toApiError(caught: unknown, fallback: string) {
  if (caught instanceof ApiError) return caught
  return new ApiError(caught instanceof Error ? caught.message : fallback, 'INTERNAL_ERROR', true)
}
