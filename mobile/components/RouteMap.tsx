import { useState, type ReactNode } from 'react'
import { Image, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { API_URL } from '@/services/api'
import type { RouteEndpoint } from '@/types/route'

type Props = {
  origin: RouteEndpoint
  destination: RouteEndpoint
  waypoints?: Array<{ lat: number; lng: number }>
  height: number
  style?: StyleProp<ViewStyle>
  /** 地図が取れないとき(読み込み中・Static Maps API が無効など)に出すもの */
  fallback: ReactNode
  children?: ReactNode
}

/**
 * ルートの本物の地図(サーバの GET /route-map が Google の静止画の地図を返す)。
 * API キーはサーバにあるので、端末は画像を受け取るだけ。取れなければ fallback を出す
 */
export function RouteMap({ origin, destination, waypoints = [], height, style, fallback, children }: Props) {
  const { width } = useWindowDimensions()
  const url = routeMapUrl(origin, destination, waypoints, width, height)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  // fallback を出さない使い方(結果画面)では、取れなかったら場所ごと消す
  if (fallback === null && failed === url) return null

  return (
    <View style={[{ height, overflow: 'hidden' }, style]}>
      {loaded !== url ? fallback : null}
      {failed !== url ? (
        <Image
          source={{ uri: url }}
          style={[StyleSheet.absoluteFill, loaded !== url && styles.hidden]}
          resizeMode="cover"
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
        />
      ) : null}
      {children}
    </View>
  )
}

function endpointValue(endpoint: RouteEndpoint) {
  return endpoint.lat !== null && endpoint.lng !== null ? `${endpoint.lat},${endpoint.lng}` : endpoint.name
}

export function routeMapUrl(origin: RouteEndpoint, destination: RouteEndpoint, waypoints: Array<{ lat: number; lng: number }>, width: number, height: number) {
  const params = [
    `origin=${encodeURIComponent(endpointValue(origin))}`,
    `destination=${encodeURIComponent(endpointValue(destination))}`,
    `w=${Math.round(Math.min(width, 640))}`,
    `h=${Math.round(Math.min(height, 640))}`,
  ]
  if (waypoints.length > 0) params.push(`waypoints=${encodeURIComponent(waypoints.map((p) => `${p.lat},${p.lng}`).join('|'))}`)
  return `${API_URL}/route-map?${params.join('&')}`
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
})
