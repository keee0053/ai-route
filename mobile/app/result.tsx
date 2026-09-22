import { Redirect, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/components/PrimaryButton'
import { colors, radius } from '@/constants/theme'
import { useRoute } from '@/context/RouteContext'
import type { GenerateRouteResponse } from '@/types/route'

type Waypoint = GenerateRouteResponse['waypoints'][number]
type EditMode = 'detail' | 'replace' | 'delete'

const candidates: Array<Waypoint & { meta: string; extra: number; reason: string }> = [
  { placeId: 'demo-maiko', name: '舞子公園', lat: 34.6314, lng: 135.0349, meta: '海沿い・明石海峡大橋', extra: 18, reason: '海辺の景色を楽しめる、ルート沿いの寄り道です。' },
  { placeId: 'demo-meriken', name: 'メリケンパーク', lat: 34.6826, lng: 135.1874, meta: '港・散歩', extra: 9, reason: '目的地の近くで、港の景色を気軽に楽しめます。' },
  { placeId: 'demo-shioya', name: '塩屋海岸', lat: 34.6335, lng: 135.0839, meta: '海沿い・静かな場所', extra: 12, reason: 'にぎわいを避けて、海沿いをゆっくり走れる候補です。' },
]

export default function ResultScreen() {
  const { result } = useRoute()
  const [route, setRoute] = useState(result)
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<EditMode>('detail')
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [recalculating, setRecalculating] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const waypoint = selected === null ? null : route?.waypoints[selected] ?? null
  const candidate = candidates[candidateIndex]
  const usedNames = useMemo(() => new Set(route?.waypoints.map((item) => item.name)), [route])

  if (!route) return <Redirect href="/" />

  const openEditor = (index: number) => {
    setSelected(index)
    setMode('detail')
    setCandidateIndex(0)
  }
  const closeEditor = () => {
    if (!recalculating) {
      setSelected(null)
      setMode('detail')
    }
  }
  const applyEdit = (waypoints: Waypoint[], durationDelta: number, reason: string) => {
    setRecalculating(true)
    setTimeout(() => {
      setRoute((current) => {
        if (!current) return current
        const durationMinutes = Math.max(current.normalRoute.durationMinutes, current.recommendedRoute.durationMinutes + durationDelta)
        return {
          ...current,
          waypoints,
          recommendedRoute: {
            durationMinutes,
            distanceMeters: Math.max(current.normalRoute.distanceMeters, current.recommendedRoute.distanceMeters + durationDelta * 420),
            extraMinutes: Math.max(0, durationMinutes - current.normalRoute.durationMinutes),
          },
          reason,
          googleMapsUrl: buildMapsUrl(current, waypoints),
        }
      })
      setRecalculating(false)
      setHighlighted(selected)
      setSelected(null)
      setMode('detail')
      setTimeout(() => setHighlighted(null), 1400)
    }, 900)
  }
  const replaceWaypoint = () => {
    if (selected === null || !waypoint) return
    const next = [...route.waypoints]
    next[selected] = candidate
    applyEdit(next, candidate.extra - 8, `${candidate.name}へ立ち寄るようルートを更新しました。${candidate.reason}`)
  }
  const deleteWaypoint = () => {
    if (selected === null || !waypoint) return
    applyEdit(route.waypoints.filter((_, index) => index !== selected), -8, `${waypoint.name}を外し、残りの経由地を通るルートに更新しました。`)
  }
  const showNextCandidate = () => {
    let next = (candidateIndex + 1) % candidates.length
    while (usedNames.has(candidates[next].name) && next !== candidateIndex) next = (next + 1) % candidates.length
    setCandidateIndex(next)
  }
  const openNavigation = async () => {
    try {
      await Linking.openURL(route.googleMapsUrl)
    } catch {
      try {
        await WebBrowser.openBrowserAsync(route.googleMapsUrl)
      } catch {
        setLaunchError('Google Mapsを開けませんでした。時間をおいてもう一度お試しください。')
      }
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.map}>
          <View style={styles.water} />
          <View style={[styles.routeLine, styles.normalRoute]} />
          <View style={[styles.routeLine, styles.recommendedRoute]} />
          {route.waypoints.map((item, index) => (
            <Pressable key={`${item.name}-${index}`} accessibilityLabel={`${item.name}を編集`} onPress={() => openEditor(index)} style={[styles.pin, index === 0 ? styles.pinOne : styles.pinTwo]}>
              <Text style={styles.pinText}>{index + 1}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.body}>
          <View style={styles.resultLabelRow}>
            <Text style={styles.eyebrow}>●  AIおすすめルート</Text>
            {process.env.EXPO_PUBLIC_USE_DEMO_ROUTE !== 'false' ? <Text style={styles.demoBadge}>デモ</Text> : null}
          </View>
          <Text style={styles.duration}>{formatDuration(route.recommendedRoute.durationMinutes)}</Text>
          <View style={styles.comparison}>
            <Text style={styles.muted}>通常 {formatDuration(route.normalRoute.durationMinutes)}</Text>
            <Text style={styles.extra}>+{route.recommendedRoute.extraMinutes}分</Text>
            <Text style={styles.muted}>経由地 {route.waypoints.length}か所</Text>
          </View>
          <Text style={styles.distance}>走行距離 約{(route.recommendedRoute.distanceMeters / 1000).toFixed(1)} km</Text>
          <View style={styles.waypoints}>
            {route.waypoints.map((item, index) => (
              <Pressable key={`${item.name}-${index}`} onPress={() => openEditor(index)} style={[styles.waypointCard, highlighted === index && styles.highlightedCard]}>
                <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
                <View style={styles.waypointText}><Text style={styles.waypointName}>{item.name}</Text><Text style={styles.waypointTags}>{waypointMeta(item)}</Text></View>
                <Text style={styles.editMark}>編集</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.reasonCard}><Text style={styles.reasonLabel}>AIコメント</Text><Text style={styles.reason}>{route.reason}</Text></View>
          <View style={styles.actions}>
            {launchError ? <Text accessibilityRole="alert" style={styles.errorText}>{launchError}</Text> : null}
            <PrimaryButton onPress={openNavigation}>Google Mapsで出発</PrimaryButton>
            <PrimaryButton variant="secondary" onPress={() => router.replace('/preferences')}>もう一度生成</PrimaryButton>
          </View>
        </View>
      </ScrollView>

      <Modal visible={waypoint !== null} transparent animationType="slide" onRequestClose={closeEditor}>
        <Pressable style={styles.backdrop} onPress={closeEditor} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {recalculating ? (
            <View style={styles.recalculating}><ActivityIndicator size="large" color={colors.brand} /><Text style={styles.sheetTitle}>ルートを再計算中</Text><Text style={styles.sheetMuted}>所要時間と経路を更新しています</Text></View>
          ) : mode === 'detail' ? (
            <><Text style={styles.sheetEyebrow}>経由地 {selected === null ? '' : selected + 1}</Text><Text style={styles.sheetTitle}>{waypoint?.name}</Text><Text style={styles.sheetMuted}>この経由地を別の場所へ変更するか、ルートから削除できます。</Text><PrimaryButton onPress={() => setMode('replace')}>この場所を変更</PrimaryButton><PrimaryButton variant="secondary" onPress={() => setMode('delete')}>この場所を削除</PrimaryButton></>
          ) : mode === 'replace' ? (
            <><Text style={styles.sheetEyebrow}>おすすめの変更先</Text><Text style={styles.sheetTitle}>{candidate.name}</Text><Text style={styles.candidateMeta}>{candidate.meta}　目安 +{candidate.extra}分</Text><Text style={styles.sheetMuted}>{candidate.reason}</Text><PrimaryButton onPress={replaceWaypoint}>この場所に変更</PrimaryButton><PrimaryButton variant="secondary" onPress={showNextCandidate}>別の候補を見る</PrimaryButton></>
          ) : (
            <><Text style={styles.sheetEyebrow}>経由地を削除</Text><Text style={styles.sheetTitle}>{waypoint?.name}を外しますか？</Text><Text style={styles.sheetMuted}>残りの経由地を使ってルートを再計算します。</Text><PrimaryButton onPress={deleteWaypoint}>削除して再計算</PrimaryButton><PrimaryButton variant="secondary" onPress={() => setMode('detail')}>戻る</PrimaryButton></>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function buildMapsUrl(result: GenerateRouteResponse, waypoints: Waypoint[]) {
  const params = new URLSearchParams({ api: '1', travelmode: 'driving', origin: result.origin.name, destination: result.destination.name })
  if (waypoints.length) params.set('waypoints', waypoints.map((item) => item.name).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}時間${rest > 0 ? `${rest}分` : ''}` : `${minutes}分`
}

function waypointMeta(waypoint: Waypoint) {
  const details = [
    waypoint.category,
    waypoint.rating ? `★ ${waypoint.rating.toFixed(1)}` : null,
    waypoint.detourMinutes ? `+${waypoint.detourMinutes}分` : null,
  ].filter(Boolean)
  return details.join('  ·  ') || waypoint.tags?.join('・') || 'おすすめの寄り道'
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white }, content: { flexGrow: 1 },
  map: { height: 315, overflow: 'hidden', backgroundColor: '#EFF6FF' }, water: { position: 'absolute', right: 0, width: '48%', height: '100%', backgroundColor: '#DBEAFE' },
  routeLine: { position: 'absolute', height: 5, borderRadius: 3, transform: [{ rotate: '-48deg' }] }, normalRoute: { width: 275, left: 46, top: 157, backgroundColor: '#CBD5E1' }, recommendedRoute: { width: 295, left: 35, top: 168, backgroundColor: colors.brand },
  pin: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, pinOne: { left: '34%', top: '58%' }, pinTwo: { left: '58%', top: '32%' }, pinText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  body: { flex: 1, padding: 22, gap: 12 }, eyebrow: { color: colors.brand, fontSize: 12, fontWeight: '800' }, resultLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  demoBadge: { color: colors.muted, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, fontSize: 11, fontWeight: '700' }, duration: { color: colors.ink, fontSize: 30, fontWeight: '800' },
  comparison: { flexDirection: 'row', gap: 10, alignItems: 'center' }, muted: { color: colors.faint, fontSize: 13 }, distance: { color: colors.muted, fontSize: 12 }, extra: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, fontSize: 12, fontWeight: '700' },
  waypoints: { gap: 8, marginTop: 6 }, waypointCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, backgroundColor: colors.surface, padding: 13 }, highlightedCard: { borderColor: colors.brand, backgroundColor: '#F0F9FF' },
  number: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }, numberText: { color: colors.white, fontSize: 13, fontWeight: '800' }, waypointText: { flex: 1 }, waypointName: { color: colors.ink, fontSize: 15, fontWeight: '700' }, waypointTags: { color: colors.faint, fontSize: 12, marginTop: 2 }, editMark: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  reasonCard: { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1, borderRadius: radius.large, padding: 15, gap: 7 }, reasonLabel: { color: colors.brand, fontSize: 12, fontWeight: '800' }, reason: { color: '#475569', fontSize: 13, lineHeight: 20 }, actions: { gap: 9, marginTop: 4 }, errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.42)' }, sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 34, gap: 12 },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 8 }, sheetEyebrow: { color: colors.brand, fontSize: 12, fontWeight: '800' }, sheetTitle: { color: colors.ink, fontSize: 21, lineHeight: 28, fontWeight: '800' }, sheetMuted: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 }, candidateMeta: { color: colors.ink, backgroundColor: '#F1F5F9', borderRadius: 8, padding: 10, fontSize: 12, fontWeight: '700' }, recalculating: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 12 },
})
