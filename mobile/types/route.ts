export type Preference = 'scenic' | 'ocean' | 'night_view' | 'mountain' | 'cafe' | 'gourmet' | 'hot_spring' | 'detour' | 'quiet'

export type TimeConstraint =
  | { type: 'none' }
  | { type: 'extra_time'; minutes: number }
  | { type: 'total_time'; minutes: number }

export type RoutePreview = {
  origin: { name: string; lat: number; lng: number }
  destination: { name: string; lat: number; lng: number }
  normalRoute: { durationMinutes: number; distanceMeters: number }
}

export type GenerateRouteResponse = RoutePreview & {
  recommendedRoute: { durationMinutes: number; distanceMeters: number; extraMinutes: number }
  waypoints: Array<{
    placeId: string
    name: string
    lat: number
    lng: number
    category?: string
    rating?: number
    reviewCount?: number
    photoUrl?: string
    tags?: string[]
    detourMinutes?: number
  }>
  reason: string
  googleMapsUrl: string
}

export type GenerateRouteInput = {
  googleMapsUrl: string
  preferences: Preference[]
  freeText: string
  timeConstraint: TimeConstraint
}
