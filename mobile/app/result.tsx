import { Redirect, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/components/PrimaryButton'
import { RouteMap } from '@/components/RouteMap'
import { arrivalTimes, formatClock, formatDuration, waypointSummary } from '@/components/waypoint-format'
import { colors, radius } from '@/constants/theme'
import { useRoute } from '@/context/RouteContext'
import { editRoute } from '@/services/api'

const HERO_HEIGHT = 380
/** 下のシートが写真に重なる高さ。地図はこの分だけ低くして、左下の Google のロゴを隠さない */
const SHEET_OVERLAP = 18

/**
 * 結果画面。上半分は経由地の写真(横スワイプ)、下は 出発→経由地→到着 の時刻つきの流れ。
 * 経由地をタップすると全画面の編集(/edit)に進む。
 */
export default function ResultScreen() {
  const routeState = useRoute()
  const route = routeState.result
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState(0)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // 画面を開いた時刻を出発時刻とみなす。編集で経路が変わったら計算し直す
  const start = useMemo(() => new Date(), [route])
  const times = useMemo(() => (route ? arrivalTimes(route, start) : null), [route, start])

  if (!route) return <Redirect href="/" />

  const openEditor = (index: number) => router.push({ pathname: '/edit', params: { index: String(index) } })

  const addWaypoint = async () => {
    setAdding(true)
    setAddError(null)
    try {
      routeState.updateResult(await editRoute({
        route,
        preferences: routeState.preferences,
        freeText: routeState.freeText,
        timeConstraint: routeState.timeConstraint,
        action: { type: 'add' },
      }))
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : '経由地を追加できませんでした。')
    } finally {
      setAdding(false)
    }
  }

  const openNavigation = async () => {
    setLaunchError(null)
    const url = navigationUrl(route)
    try {
      await Linking.openURL(url)
    } catch {
      try {
        await WebBrowser.openBrowserAsync(url)
      } catch {
        setLaunchError('Google Mapsを開けませんでした。時間をおいてもう一度お試しください。')
      }
    }
  }

  const count = route.waypoints.length

  return (
    <View style={styles.screen}>
      {/* 写真の上に時計が乗るので白文字にする */}
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 150 + insets.bottom }}>
        <View style={{ height: HERO_HEIGHT }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
          >
            {route.waypoints.map((waypoint, index) => (
              <Pressable key={waypoint.placeId} accessibilityLabel={`${waypoint.name}を選び直す`} onPress={() => openEditor(index)} style={{ width, height: HERO_HEIGHT }}>
                {waypoint.photoUrl ? <Image source={{ uri: waypoint.photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, styles.noPhoto]} />}
                <View style={styles.shadeTop} />
                {/* 段階的に重ねてグラデーション風にする(境目の線を目立たせない) */}
                <View style={[styles.shadeBottom, { height: 230, opacity: 0.35 }]} />
                <View style={[styles.shadeBottom, { height: 170, opacity: 0.45 }]} />
                <View style={[styles.shadeBottom, { height: 110, opacity: 0.55 }]} />
                <View style={styles.caption}>
                  <Text style={styles.captionEyebrow}>経由地 {index + 1} / {count}・横にスワイプ</Text>
                  <Text style={styles.captionName} numberOfLines={2}>{waypoint.name}</Text>
                  <Text style={styles.captionMeta} numberOfLines={1}>{waypointSummary(waypoint)}・タップで選び直す</Text>
                </View>
              </Pressable>
            ))}
            {/* 最後の1枚は経由地込みの経路の地図。取れなければ灰色の面に文言だけ出す */}
            <RouteMap
              origin={route.origin}
              destination={route.destination}
              waypoints={route.waypoints}
              height={HERO_HEIGHT - SHEET_OVERLAP}
              style={{ width, marginBottom: SHEET_OVERLAP }}
              fallback={<View style={[StyleSheet.absoluteFill, styles.noPhoto, styles.noWaypoint]}><Text style={styles.noWaypointText}>{count > 0 ? '地図を読み込み中…' : '寄り道なしのルートです'}</Text></View>}
            >
              <View pointerEvents="none" style={styles.shadeTop} />
            </RouteMap>
          </ScrollView>
          {count > 0 ? (
            <View pointerEvents="none" style={styles.dots}>
              {/* 地図の上では白い点が見えないので、濃い下地を敷く */}
              <View style={[styles.dotsInner, page === count && styles.dotsOnMap]}>
                {Array.from({ length: count + 1 }, (_, index) => <View key={index} style={[styles.dot, index === page && styles.dotActive]} />)}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={styles.summary}>
            <Text style={styles.duration}>{formatDuration(route.recommendedRoute.durationMinutes)}</Text>
            <Text style={styles.extra}>+{route.recommendedRoute.extraMinutes}分</Text>
            <Text style={styles.muted}>通常 {formatDuration(route.normalRoute.durationMinutes)}・{(route.recommendedRoute.distanceMeters / 1000).toFixed(1)} km</Text>
          </View>

          <View>
            <TimelineRow kind="start" title={route.origin.name} time={times ? formatClock(start) : null} last={false} />
            {route.waypoints.map((waypoint, index) => (
              <TimelineRow
                key={waypoint.placeId}
                kind="waypoint"
                number={index + 1}
                photoUrl={waypoint.photoUrl}
                title={waypoint.name}
                subtitle={waypointSummary(waypoint)}
                time={times ? formatClock(times.waypoints[index]!) : null}
                onPress={() => openEditor(index)}
                last={false}
              />
            ))}
            <AddWaypointRow loading={adding} onPress={addWaypoint} />
            <TimelineRow kind="end" title={route.destination.name} time={times ? formatClock(times.destination) : null} last />
          </View>
          {addError ? <Text accessibilityRole="alert" style={styles.errorText}>{addError}</Text> : null}

          {route.reason ? (
            <View style={styles.reasonCard}><Text style={styles.reasonLabel}>AIコメント</Text><Text style={styles.reason}>{route.reason}</Text></View>
          ) : null}
          {launchError ? <Text accessibilityRole="alert" style={styles.errorText}>{launchError}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <PrimaryButton onPress={openNavigation}>Google Mapsで出発</PrimaryButton>
        <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/preferences')}><Text style={styles.regenerate}>条件を変えてもう一度作る</Text></Pressable>
      </View>
    </View>
  )
}

function AddWaypointRow({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="経由地を追加"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.addRowPressed]}
    >
      <View style={styles.rail}>
        <View style={styles.railLine} />
        <View style={styles.addPoint}>
          {loading ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.addPointText}>+</Text>}
        </View>
        <View style={styles.railLine} />
      </View>
      <Text style={styles.addText}>{loading ? '経由地を探しています…' : '経由地を追加'}</Text>
    </Pressable>
  )
}

/**
 * 出発地が現在地なら origin を外して渡す。Google マップが「現在地」から案内するので、
 * 座標(=住所)が出発地として表示されず、移動中でも今いる場所から始まる
 */
function navigationUrl(route: { googleMapsUrl: string; origin: { name: string } }) {
  if (route.origin.name !== '現在地') return route.googleMapsUrl
  // React Native の URL は searchParams.delete が無いことがあるので文字列で外す
  return route.googleMapsUrl.replace(/([?&])origin=[^&]*&?/, '$1').replace(/[?&]$/, '')
}

type TimelineRowProps = {
  kind: 'start' | 'waypoint' | 'end'
  title: string
  subtitle?: string
  time: string | null
  number?: number
  photoUrl?: string | null
  onPress?: () => void
  last: boolean
}

function TimelineRow({ kind, title, subtitle, time, number, photoUrl, onPress, last }: TimelineRowProps) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.railLine, kind === 'start' && styles.railHidden]} />
        {kind === 'waypoint' ? (
          <View style={styles.number}><Text style={styles.numberText}>{number}</Text></View>
        ) : (
          <View style={kind === 'end' ? [styles.endpoint, styles.endpointEnd] : styles.startPoint} />
        )}
        <View style={[styles.railLine, last && styles.railHidden]} />
      </View>
      {kind === 'waypoint' ? (
        photoUrl ? <Image source={{ uri: photoUrl }} style={styles.thumb} /> : <View style={[styles.thumb, styles.noPhoto]} />
      ) : null}
      <View style={styles.rowText}>
        <Text style={kind === 'waypoint' ? styles.rowTitle : styles.rowEndpoint} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {time ? <Text style={styles.time}>{time}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  noPhoto: { backgroundColor: '#CBD5E1' },
  noWaypoint: { alignItems: 'center', justifyContent: 'center' },
  noWaypointText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 64, backgroundColor: 'rgba(15, 23, 42, 0.3)' },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  caption: { position: 'absolute', left: 20, right: 20, bottom: 46 },
  captionEyebrow: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800' },
  captionName: { color: colors.white, fontSize: 25, lineHeight: 31, fontWeight: '800', marginTop: 2 },
  captionMeta: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 3 },
  dots: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  dotsInner: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  dotsOnMap: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 20, backgroundColor: colors.white },
  sheet: { marginTop: -SHEET_OVERLAP, backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  duration: { color: colors.ink, fontSize: 30, fontWeight: '800' },
  extra: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  muted: { color: colors.faint, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rail: { width: 26, alignItems: 'center', alignSelf: 'stretch' },
  railLine: { flex: 1, width: 2, backgroundColor: '#CBD5E1' },
  railHidden: { backgroundColor: 'transparent' },
  endpoint: { width: 13, height: 13, borderRadius: 7, borderWidth: 3, borderColor: colors.origin, backgroundColor: colors.white },
  // 出発地は Google マップと同じ 白いふちの灰色の丸
  startPoint: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.origin, borderWidth: 2, borderColor: colors.white, shadowColor: colors.ink, shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 },
  endpointEnd: { borderColor: colors.destination },
  number: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  addRow: { minHeight: 50 },
  addRowPressed: { opacity: 0.65 },
  addPoint: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  addPointText: { color: colors.brand, fontSize: 22, lineHeight: 23, fontWeight: '500' },
  addText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  thumb: { width: 46, height: 46, borderRadius: 10 },
  rowText: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  rowEndpoint: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  rowSubtitle: { color: colors.muted, fontSize: 11, marginTop: 1 },
  time: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  reasonCard: { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1, borderRadius: radius.large, padding: 14, gap: 5 },
  reasonLabel: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  reason: { color: '#475569', fontSize: 13, lineHeight: 20 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.96)', gap: 8 },
  regenerate: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 4 },
})
