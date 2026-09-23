export type Preference = 'scenic' | 'ocean' | 'night_view' | 'mountain' | 'cafe' | 'gourmet' | 'hot_spring' | 'detour' | 'quiet'

export type TimeConstraint =
  | { type: 'none' }
  | { type: 'extra_time'; minutes: number }
  | { type: 'total_time'; minutes: number }

export type RouteEndpoint = {
  name: string
  lat: number | null
  lng: number | null
}

export type RouteSummary = {
  durationMinutes: number
  distanceMeters: number
}

export type RoutePreview = {
  origin: RouteEndpoint
  destination: RouteEndpoint
  normalRoute: RouteSummary
}

export type RouteWaypoint = {
  placeId: string
  name: string
  lat: number
  lng: number
  category: string | null
  rating: number | null
  reviewCount: number | null
  photoUrl: string | null
  tags: string[]
  detourMinutes: number
}

export type GenerateRouteResponse = RoutePreview & {
  recommendedRoute: RouteSummary & { extraMinutes: number }
  waypoints: RouteWaypoint[]
  reason: string
  googleMapsUrl: string
}

/** POST /generate-route request sent after the shared Maps URL is parsed. */
export type GenerateRouteRequest = {
  origin: string
  destination: string
  preferences: Preference[]
  freeText: string
  timeConstraint: TimeConstraint
  waypointCount: 1 | 2
}

export type RouteApiErrorCode =
  | 'INVALID_REQUEST'
  | 'ROUTE_NOT_FOUND'
  | 'NO_CANDIDATES'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR'

export type RouteApiErrorResponse = {
  error: {
    code: RouteApiErrorCode
    message: string
  }
}

/** Input kept by the UI before it resolves a shared Google Maps URL. */
export type GenerateRouteInput = {
  googleMapsUrl: string
  preferences: Preference[]
  freeText: string
  timeConstraint: TimeConstraint
}
