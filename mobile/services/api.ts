import type {
  GenerateRouteInput,
  GenerateRouteRequest,
  GenerateRouteResponse,
  Preference,
  RoutePreview,
  TimeConstraint,
} from '@/types/route'

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://ekz-server.prizmprograms.workers.dev'

type ApiErrorBody = { error?: string | { code?: string; message?: string } }
type ParsedRoute = { origin: string; destination: string }

type BackendCandidate = {
  id: string
  name: string
  category?: string
  lat?: number
  lng?: number
  rating?: number | null
  reviewCount?: number | null
  photoName?: string | null
  detourMinutes?: number
  routeRatio?: number
  offRouteKm?: number
}

type SearchResponse = {
  baseMinutes: number
  distanceKm: number
  candidates: BackendCandidate[]
}

type NextResponse = { id?: string | null; reason?: string | null }
type TagResponse = { tags?: string[] }

export type HealthResponse = { ok: true }

export class ApiError extends Error {
  constructor(message: string, public readonly code = 'NETWORK_ERROR') {
    super(message)
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(API_URL + '/', { signal })
  if (!response.ok) throw new ApiError('バックエンドへ接続できませんでした。')
  return { ok: true }
}

export async function getRoutePreview(googleMapsUrl: string): Promise<RoutePreview> {
  const route = await parseSharedRoute(googleMapsUrl)
  const search = await searchCandidates(route.origin, route.destination)
  return {
    origin: endpoint(route.origin),
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
  const search = await searchCandidates(request.origin, request.destination, genreFor(request.preferences))
  const pool = filterCandidates(search.candidates, search.baseMinutes, request.timeConstraint)

  if (pool.length === 0) {
    throw new ApiError('条件に合う寄り道候補が見つかりませんでした。', 'NO_CANDIDATES')
  }

  const desiredCount = Math.min(request.waypointCount, pool.length)
  const selected: BackendCandidate[] = []
  const reasons: string[] = []
  let remaining = pool
  const maxExtraMinutes = extraAllowance(search.baseMinutes, request.timeConstraint)
  let usedExtraMinutes = 0

  for (let index = 0; index < desiredCount; index += 1) {
    const available = remaining.filter((item) => (item.detourMinutes ?? 0) <= maxExtraMinutes - usedExtraMinutes)
    if (available.length === 0) break
    const pick = await pickCandidate(available, request.freeText, request.preferences)
    const candidate = available.find((item) => item.id === pick.id) ?? available[0]
    if (!candidate) break
    selected.push(candidate)
    usedExtraMinutes += candidate.detourMinutes ?? 0
    if (pick.reason) reasons.push(pick.reason)
    remaining = remaining.filter((item) => item.id !== candidate.id)
  }

  selected.sort((a, b) => (a.routeRatio ?? 0) - (b.routeRatio ?? 0))
  const tags = await Promise.all(selected.map((candidate) => fetchTags(candidate)))
  const extraMinutes = selected.reduce((total, candidate) => total + (candidate.detourMinutes ?? 0), 0)
  const distanceMeters = Math.round(
    search.distanceKm * 1000 + selected.reduce((total, candidate) => total + (candidate.offRouteKm ?? 0) * 2000, 0),
  )

  const waypoints = selected.map((candidate, index) => ({
    placeId: candidate.id,
    name: candidate.name,
    lat: candidate.lat ?? 0,
    lng: candidate.lng ?? 0,
    category: candidate.category || null,
    rating: candidate.rating ?? null,
    reviewCount: candidate.reviewCount ?? null,
    photoUrl: candidate.photoName
      ? API_URL + '/photo?name=' + encodeURIComponent(candidate.photoName) + '&maxWidthPx=1200'
      : null,
    tags: tags[index] ?? [],
    detourMinutes: candidate.detourMinutes ?? 0,
  }))

  return {
    origin: endpoint(route.origin),
    destination: endpoint(route.destination),
    normalRoute: {
      durationMinutes: search.baseMinutes,
      distanceMeters: Math.round(search.distanceKm * 1000),
    },
    recommendedRoute: {
      durationMinutes: search.baseMinutes + extraMinutes,
      distanceMeters,
      extraMinutes,
    },
    waypoints,
    reason: reasons[0] ?? preferenceText(request.preferences) + 'に合う、ルート沿いの評価が高い場所を選びました。',
    googleMapsUrl: buildMapsUrl(route, selected),
  }
}

async function searchCandidates(origin: string, destination: string, genre?: string): Promise<SearchResponse> {
  return postJson<SearchResponse>('/search', { origin, destination, genre })
}

async function pickCandidate(candidates: BackendCandidate[], request: string, preferences: Preference[]) {
  try {
    return await postJson<NextResponse>('/next', {
      candidates: candidates.slice(0, 30),
      request: request || preferenceText(preferences),
    })
  } catch {
    return { id: candidates[0]?.id, reason: null }
  }
}

async function fetchTags(candidate: BackendCandidate): Promise<string[]> {
  try {
    const response = await postJson<TagResponse>('/tag', { candidate })
    return response.tags?.slice(0, 4) ?? []
  } catch {
    return candidate.category ? [candidate.category] : []
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('通信できませんでした。接続を確認してください。')
  }

  const payload = await response.json() as T & ApiErrorBody
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : payload.error?.message
    throw new ApiError(message ?? 'バックエンドでエラーが発生しました。')
  }
  return payload
}

async function parseSharedRoute(sharedText: string): Promise<ParsedRoute> {
  const extracted = sharedText.match(/https?:\/\/\S+/)?.[0] ?? sharedText.trim()
  let resolved = extracted

  try {
    const url = new URL(extracted)
    if (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl') {
      const response = await fetch(extracted, { method: 'GET' })
      resolved = response.url || extracted
    }
  } catch {
    throw new ApiError('Google Mapsの共有URLを確認してください。', 'MAPS_URL_PARSE_FAILED')
  }

  const url = new URL(resolved)
  const queryOrigin = url.searchParams.get('origin')
  const queryDestination = url.searchParams.get('destination')
  if (queryOrigin && queryDestination) {
    return { origin: cleanPlace(queryOrigin), destination: cleanPlace(queryDestination) }
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const dirIndex = segments.indexOf('dir')
  const places = segments
    .slice(dirIndex + 1)
    .filter((segment) => !segment.startsWith('@') && !segment.startsWith('data='))
    .map(cleanPlace)
    .filter(Boolean)

  if (dirIndex >= 0 && places.length >= 2) {
    return { origin: places[0]!, destination: places.at(-1)! }
  }
  throw new ApiError('出発地と目的地を含むGoogle Mapsのルートを共有してください。', 'MAPS_URL_PARSE_FAILED')
}

function cleanPlace(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).trim()
  } catch {
    return value.replace(/\+/g, ' ').trim()
  }
}

function endpoint(value: string) {
  const [lat, lng] = value.split(',').map(Number)
  return {
    name: Number.isFinite(lat) && Number.isFinite(lng) ? lat.toFixed(5) + ', ' + lng.toFixed(5) : value,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }
}

function filterCandidates(candidates: BackendCandidate[], baseMinutes: number, constraint: TimeConstraint) {
  const allowedExtra = extraAllowance(baseMinutes, constraint)

  return candidates
    .filter((candidate) => {
      const ratio = candidate.routeRatio ?? 0.5
      return ratio >= 0.08
        && ratio <= 0.96
        && (candidate.offRouteKm ?? 0) <= 6
        && (candidate.detourMinutes ?? 0) <= allowedExtra
    })
    .sort((a, b) => {
      const rating = (b.rating ?? 0) - (a.rating ?? 0)
      return rating !== 0 ? rating : (a.detourMinutes ?? 0) - (b.detourMinutes ?? 0)
    })
}

function extraAllowance(baseMinutes: number, constraint: TimeConstraint) {
  if (constraint.type === 'none') return 60
  if (constraint.type === 'extra_time') return constraint.minutes
  return Math.max(0, constraint.minutes - baseMinutes)
}

function genreFor(preferences: Preference[]) {
  if (preferences.includes('cafe')) return 'sweets'
  if (preferences.includes('gourmet')) return 'meal'
  if (preferences.some((item) => ['scenic', 'ocean', 'night_view', 'mountain'].includes(item))) return 'view'
  if (preferences.some((item) => item === 'hot_spring' || item === 'quiet')) return 'rest'
  return undefined
}

function preferenceText(preferences: Preference[]) {
  const labels: Record<Preference, string> = {
    scenic: '景色',
    ocean: '海沿い',
    night_view: '夜景',
    mountain: '山道',
    cafe: 'カフェ',
    gourmet: 'グルメ',
    hot_spring: '温泉',
    detour: '寄り道',
    quiet: '静かな場所',
  }
  return preferences.map((item) => labels[item]).join('・') || 'おまかせ'
}

function buildMapsUrl(route: ParsedRoute, candidates: BackendCandidate[]) {
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    origin: route.origin,
    destination: route.destination,
  })
  if (candidates.length) {
    params.set('waypoints', candidates.map((candidate) =>
      candidate.lat != null && candidate.lng != null ? candidate.lat + ',' + candidate.lng : candidate.name,
    ).join('|'))
  }
  return 'https://www.google.com/maps/dir/?' + params.toString()
}
