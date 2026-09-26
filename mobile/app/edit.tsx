import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/components/PrimaryButton'
import { formatDuration, minutesUntil, tagsOf, waypointSummary } from '@/components/waypoint-format'
import { colors } from '@/constants/theme'
import { useRoute } from '@/context/RouteContext'
import { ApiError, editRoute } from '@/services/api'
import type { GenerateRouteResponse, RouteWaypoint } from '@/types/route'

type TagState = 'ng' | 'good'
/** いま見せている1件と、それを含む経路。original は選び直す前の経由地 */
type Shown = { waypoint: RouteWaypoint; route: GenerateRouteResponse; original: boolean }

/** いい感じ(緑)。Kotlin 版と同じ色 */
const GOOD_BG = '#CDEFCB'
const GOOD_FG = '#1B5E20'
const NG_BG = '#FEE2E2'
const NG_FG = '#B91C1C'

/**
 * 経由地を1件ずつ全画面で見せて選び直す(Kotlin 版の PickScreen と同じ作り)。
 *
 * タグは タップするたびに そのまま → 嫌(赤) → いい感じ(緑) → そのまま と回る。
 * 「別の場所」を押すと、印をサーバに渡して次の1件を出す(赤は似た候補ごと外れる)。
 */
export default function EditScreen() {
  const params = useLocalSearchParams<{ index?: string }>()
  const index = Number(params.index ?? 0)
  const { result, preferences, freeText, timeConstraint, updateResult } = useRoute()
  const initial = result?.waypoints[index]
  const [shown, setShown] = useState<Shown | null>(initial && result ? { waypoint: initial, route: result, original: true } : null)
  const [history, setHistory] = useState<Shown[]>([])
  const [tagStates, setTagStates] = useState<Record<string, TagState>>({})
  const [excluded, setExcluded] = useState<string[]>([])
  const [eliminated, setEliminated] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fade = useRef(new Animated.Value(1)).current

  // 切り替わりが分かるようにフェードさせる。パッと入れ替わると安っぽく見える
  useEffect(() => {
    fade.setValue(0)
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start()
  }, [fade, shown?.waypoint.placeId])

  if (!result || !shown) return <Redirect href="/result" />

  const badTags = Object.keys(tagStates).filter((tag) => tagStates[tag] === 'ng')
  const goodTags = Object.keys(tagStates).filter((tag) => tagStates[tag] === 'good')

  const toggleTag = (tag: string) => setTagStates((current) => {
    const next = { ...current }
    if (!current[tag]) next[tag] = 'ng'
    else if (current[tag] === 'ng') next[tag] = 'good'
    else delete next[tag]
    return next
  })

  const showNext = async () => {
    const nextExcluded = [...excluded, shown.waypoint.placeId]
    setExcluded(nextExcluded)
    setLoading(true)
    setError(null)
    try {
      const updated = await editRoute({
        route: result,
        travelMode: result.travelMode,
        preferences,
        freeText,
        timeConstraint,
        action: { type: 'replace', waypointIndex: index, excludedPlaceIds: nextExcluded, badTags, goodTags },
      })
      setHistory((current) => [...current, shown])
      setEliminated(updated.eliminatedCount ?? 0)
      setShown({ waypoint: updated.waypoints[index]!, route: updated, original: false })
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'NO_CANDIDATES'
        ? 'ほかの候補が見つかりませんでした。赤い印を減らすか、「ひとつ前に戻る」でお試しください。'
        : caught instanceof Error ? caught.message : '次の候補を取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((current) => current.slice(0, -1))
    setEliminated(0)
    setShown(previous)
  }

  const decide = () => {
    if (!shown.original) updateResult(shown.route)
    router.back()
  }

  const removeWaypoint = () => {
    Alert.alert('経由地から外しますか?', `${result.waypoints[index]?.name}に寄らないルートにします。`, [
      { text: 'やめる', style: 'cancel' },
      {
        text: '外す',
        style: 'destructive',
        onPress: async () => {
          setLoading(true)
          try {
            updateResult(await editRoute({ route: result, preferences, freeText, timeConstraint, travelMode: result.travelMode, action: { type: 'delete', waypointIndex: index } }))
            router.back()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : '経由地を外せませんでした。')
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  const { waypoint, route } = shown
  const until = minutesUntil(route, index)
  const reason = shown.original ? null : route.reason
  const marked = [...badTags.map((tag) => `✕${tag}`), ...goodTags.map((tag) => `○${tag}`)]

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* 結果画面が時計を白にしているので戻す */}
      <StatusBar style="dark" />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backIcon}>‹</Text></Pressable>
        <View style={styles.topText}>
          <Text style={styles.eyebrow}>経由地 {index + 1} を選び直す</Text>
          <Text style={styles.routeLabel} numberOfLines={1}>{result.origin.name} → {result.destination.name}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={removeWaypoint} disabled={loading}><Text style={styles.remove}>外す</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={{ opacity: fade, gap: 10 }}>
          {waypoint.photoUrl
            ? <Image source={{ uri: waypoint.photoUrl }} style={styles.photo} resizeMode="cover" />
            : <View style={[styles.photo, styles.noPhoto]}><Text style={styles.noPhotoText}>{waypoint.category ?? '写真なし'}</Text></View>}
          {/* なぜこれを選んだか。店名の上に置くと「AIが選んだ」文脈で読める */}
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
          <Text style={styles.name}>{waypoint.name}</Text>
          <Text style={styles.meta}>{waypointSummary(waypoint)}{eliminated > 0 ? `・似た候補を${eliminated}件はずしました` : ''}</Text>

          <Text style={styles.help}>タップで 嫌(赤) → いい感じ(緑) → そのまま</Text>
          <View style={styles.tags}>
            {tagsOf(waypoint).map((tag) => {
              const state = tagStates[tag]
              return (
                <Pressable key={tag} accessibilityRole="button" onPress={() => toggleTag(tag)} style={[styles.tag, state === 'ng' && styles.tagNg, state === 'good' && styles.tagGood]}>
                  <Text style={[styles.tagText, state === 'ng' && styles.tagTextNg, state === 'good' && styles.tagTextGood]}>{tag}</Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.facts}>
            <Fact label="追加でかかる時間" value={`+${route.recommendedRoute.extraMinutes}分`} note={`寄ると合計 ${formatDuration(route.recommendedRoute.durationMinutes)}`} />
            <Fact label="そこに着くまで" value={until === null ? '—' : until < 1 ? 'すぐそこ' : `約${formatDuration(until)}`} />
            <Fact label="価格相場" value={waypoint.priceRange ?? '不明'} />
          </View>
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {marked.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setTagStates({})}><Text style={styles.marked} numberOfLines={1}>印: {marked.join(' ')}  ・すべて解除</Text></Pressable>
        ) : null}
        <View style={styles.buttons}>
          <View style={styles.button}><PrimaryButton onPress={decide} disabled={loading}>ここにする</PrimaryButton></View>
          <View style={styles.button}><PrimaryButton variant="secondary" onPress={() => void showNext()} loading={loading}>別の場所</PrimaryButton></View>
        </View>
        {history.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={goBack} disabled={loading}><Text style={styles.previous}>‹ ひとつ前の場所に戻る</Text></Pressable>
        ) : null}
      </View>
      {loading ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View> : null}
    </SafeAreaView>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <View style={styles.factValueBox}>
        <Text style={styles.factValue}>{value}</Text>
        {note ? <Text style={styles.factNote}>{note}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.ink, fontSize: 28, lineHeight: 30 },
  topText: { flex: 1 },
  eyebrow: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  routeLabel: { color: colors.faint, fontSize: 12 },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '700', padding: 6 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  photo: { width: '100%', aspectRatio: 3 / 2, borderRadius: 18 },
  noPhoto: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  reason: { color: colors.brandDark, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 4 },
  name: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13, marginTop: -4 },
  help: { color: colors.faint, fontSize: 11, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { backgroundColor: '#F1F5F9', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7 },
  tagNg: { backgroundColor: NG_BG },
  tagGood: { backgroundColor: GOOD_BG },
  tagText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  tagTextNg: { color: NG_FG },
  tagTextGood: { color: GOOD_FG },
  facts: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#EEF2F6' },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  factLabel: { color: colors.muted, fontSize: 13 },
  factValueBox: { alignItems: 'flex-end' },
  factValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  factNote: { color: colors.faint, fontSize: 11 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18, gap: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  marked: { color: colors.brandDark, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
  previous: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 2 },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.35)' },
})
