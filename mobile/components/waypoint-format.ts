import type { GenerateRouteResponse, RouteWaypoint } from '@/types/route'

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}時間${rest > 0 ? `${rest}分` : ''}` : `${minutes}分`
}

export function formatClock(date: Date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 種別・評価・価格を1行に。無いものは出さない */
export function waypointSummary(waypoint: RouteWaypoint) {
  return [
    waypoint.category,
    waypoint.rating ? `★${waypoint.rating.toFixed(1)}` : null,
    waypoint.priceRange,
  ].filter(Boolean).join('・')
}

/** 「何が違った?」で出す特徴。種別も選べるようにする(「公園じゃない」など) */
export function tagsOf(waypoint: RouteWaypoint) {
  return [...new Set([waypoint.category, ...(waypoint.tags ?? [])].filter((tag): tag is string => Boolean(tag)))].slice(0, 10)
}

/**
 * 出発を start としたときの、各経由地と目的地への到着時刻。
 * 区間の所要時間が返っていないときは null(時刻を出さない)。
 */
export function arrivalTimes(route: GenerateRouteResponse, start: Date) {
  const legs = route.recommendedRoute.legMinutes
  if (!legs || legs.length !== route.waypoints.length + 1) return null
  const times: Date[] = []
  let minutes = 0
  route.waypoints.forEach((_waypoint, index) => {
    minutes += legs[index]!
    times.push(new Date(start.getTime() + minutes * 60000))
  })
  minutes += legs.at(-1)!
  return { waypoints: times, destination: new Date(start.getTime() + minutes * 60000) }
}

/** 出発地からその経由地に着くまで(分)。区間の所要時間があればそれを使う */
export function minutesUntil(route: GenerateRouteResponse, index: number) {
  const legs = route.recommendedRoute.legMinutes
  if (legs && legs.length === route.waypoints.length + 1) {
    let minutes = 0
    for (let i = 0; i <= index; i += 1) {
      minutes += legs[i]!
    }
    return minutes
  }
  return route.waypoints[index]?.minutesToArrive ?? null
}
