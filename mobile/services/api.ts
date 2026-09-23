import type {
  EditRouteRequest,
  GenerateRouteInput,
  GenerateRouteRequest,
  GenerateRouteResponse,
  RouteApiErrorCode,
  RoutePreview,
} from '@/types/route'
import * as Location from 'expo-location'

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://ekz-server.prizmprograms.workers.dev'

type ApiErrorBody = { error?: string | { code?: string; message?: string } }
type ParsedRoute = { origin: string; destination: string; originIsCurrentLocation: boolean }

type SearchResponse = {
  baseMinutes: number
  distanceKm: number
}

export type HealthResponse = { ok: true }
export type ApiErrorCode = RouteApiErrorCode
  | 'ORIGIN_REQUIRED'
  | 'LOCATION_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MAPS_URL_PARSE_FAILED'
  | 'INVALID_RESPONSE'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode = 'NETWORK_ERROR',
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response
  try {
    response = await fetch(API_URL + '/', { signal })
  } catch (caught) {
    if (isAbortError(caught)) throw new ApiError('接続確認がタイムアウトしました。', 'TIMEOUT', true)
    throw new ApiError('バックエンドへ接続できませんでした。', 'NETWORK_ERROR', true)
  }
  if (!response.ok) throw new ApiError('バックエンドへ接続できませんでした。', 'UPSTREAM_ERROR', true)
  return { ok: true }
}

export async function getRoutePreview(googleMapsUrl: string): Promise<RoutePreview> {
  const route = await parseSharedRoute(googleMapsUrl)
  const search = await searchCandidates(route.origin, route.destination)
  return {
    origin: route.originIsCurrentLocation ? { ...endpoint(route.origin), name: '現在地' } : endpoint(route.origin),
    destination: endpoint(route.destination),
    normalRoute: {
      durationMinutes: search.baseMinutes,
      distanceMeters: Math.round(search.distanceKm * 1000),
    },
  }
}

export async function generateRoute(input: GenerateRouteInput): Promise<GenerateRouteResponse> {
  const route = await parseSharedRoute(input.googleMapsUrl)
  const request: GenerateRouteRequest = {
    origin: route.origin,
    destination: route.destination,
    preferences: input.preferences,
    freeText: input.freeText,
    timeConstraint: input.timeConstraint,
    waypointCount: 2,
  }
  return postJson<GenerateRouteResponse>('/generate-route', request)
}

export async function editRoute(input: EditRouteRequest): Promise<GenerateRouteResponse> {
  return postJson<GenerateRouteResponse>('/edit-route', input)
}

async function searchCandidates(origin: string, destination: string): Promise<SearchResponse> {
  return postJson<SearchResponse>('/search', { origin, destination })
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchWithTimeout(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let payload: T & ApiErrorBody
  try {
    payload = await response.json() as T & ApiErrorBody
  } catch {
    throw new ApiError('サーバーからの応答を読み取れませんでした。', 'INVALID_RESPONSE', true)
  }
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : payload.error?.message
    const code = normalizeErrorCode(typeof payload.error === 'object' ? payload.error?.code : undefined, response.status)
    throw new ApiError(message ?? messageForStatus(response.status), code, isRetryable(code, response.status))
  }
  return payload
}

// 共有テキストの読み取りはサーバで行う(短縮URLの展開・形式の判定を1か所にまとめる)。
// 出発地が現在地のルートは、サーバに言われたときだけ端末の現在地を取って送り直す。
const parsedRoutes = new Map<string, ParsedRoute>()

async function parseSharedRoute(sharedText: string): Promise<ParsedRoute> {
  const text = sharedText.trim()
  if (!text) {
    throw new ApiError('Google Mapsで出発地と目的地を設定し、ルートを共有してください。', 'MAPS_URL_PARSE_FAILED')
  }
  const cached = parsedRoutes.get(text)
  if (cached) return cached

  let parsed: ParsedRoute
  try {
    parsed = await postJson<ParsedRoute>('/parse-share', { text })
  } catch (caught) {
    if (!(caught instanceof ApiError) || caught.code !== 'ORIGIN_REQUIRED') throw caught
    parsed = await postJson<ParsedRoute>('/parse-share', { text, current: await currentPosition() })
  }
  parsedRoutes.set(text, parsed)
  return parsed
}

async function currentPosition() {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) {
    throw new ApiError('出発地が現在地のルートです。位置情報の利用を許可してください。', 'LOCATION_UNAVAILABLE')
  }
  try {
    const position = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { lat: position.coords.latitude, lng: position.coords.longitude }
  } catch {
    throw new ApiError('現在地を取得できませんでした。', 'LOCATION_UNAVAILABLE', true)
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (caught) {
    if (controller.signal.aborted || isAbortError(caught)) {
      throw new ApiError('通信がタイムアウトしました。時間をおいてもう一度お試しください。', 'TIMEOUT', true)
    }
    throw new ApiError('通信できませんでした。インターネット接続を確認してください。', 'NETWORK_ERROR', true)
  } finally {
    clearTimeout(timeout)
  }
}


function isAbortError(caught: unknown) {
  return caught instanceof Error && caught.name === 'AbortError'
}

function normalizeErrorCode(code: string | undefined, status: number): ApiErrorCode {
  const knownCodes: ApiErrorCode[] = [
    'INVALID_REQUEST',
    'ORIGIN_REQUIRED',
    'MAPS_URL_PARSE_FAILED',
    'ROUTE_NOT_FOUND',
    'NO_CANDIDATES',
    'UPSTREAM_ERROR',
    'INTERNAL_ERROR',
  ]
  if (code && knownCodes.includes(code as ApiErrorCode)) return code as ApiErrorCode
  if (status === 400) return 'INVALID_REQUEST'
  if (status === 404) return 'ROUTE_NOT_FOUND'
  if (status >= 500) return 'UPSTREAM_ERROR'
  return 'INTERNAL_ERROR'
}

function isRetryable(code: ApiErrorCode, status: number) {
  return code === 'UPSTREAM_ERROR' || code === 'INTERNAL_ERROR' || status === 408 || status === 429 || status >= 500
}

function messageForStatus(status: number) {
  if (status === 429) return 'サービスが混み合っています。時間をおいてもう一度お試しください。'
  if (status >= 500) return 'サーバーで問題が発生しました。時間をおいてもう一度お試しください。'
  return 'ルートを作成できませんでした。'
}


function endpoint(value: string) {
  const [lat, lng] = value.split(',').map(Number)
  return {
    name: Number.isFinite(lat) && Number.isFinite(lng) ? lat.toFixed(5) + ', ' + lng.toFixed(5) : value,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }
}
