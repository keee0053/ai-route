import { router } from 'expo-router'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '@/components/PrimaryButton'
import { colors, radius } from '@/constants/theme'
import { useRoute } from '@/context/RouteContext'
import type { Preference, TimeConstraint, TravelMode } from '@/types/route'

const chips: Array<{ label: string; value: Preference }> = [
  { label: '景色', value: 'scenic' },
  { label: '海沿い', value: 'ocean' },
  { label: '夜景', value: 'night_view' },
  { label: '山道', value: 'mountain' },
  { label: 'カフェ', value: 'cafe' },
  { label: 'グルメ', value: 'gourmet' },
  { label: '温泉', value: 'hot_spring' },
  { label: '寄り道', value: 'detour' },
  { label: '静かな場所', value: 'quiet' },
]
const timeOptions: Array<{ label: string; value: TimeConstraint }> = [
  { label: '指定なし', value: { type: 'none' } },
  { label: '+30分', value: { type: 'extra_time', minutes: 30 } },
  { label: '+1時間', value: { type: 'extra_time', minutes: 60 } },
  { label: '合計時間を指定', value: { type: 'total_time', minutes: 120 } },
]
const travelModes: Array<{ label: string; value: TravelMode }> = [
  { label: '車', value: 'driving' },
  { label: '徒歩', value: 'walking' },
  { label: '自転車', value: 'bicycling' },
]

export default function PreferencesScreen() {
  const route = useRoute()
  const [selected, setSelected] = useState<Preference[]>(route.preferences)
  const [time, setTime] = useState<TimeConstraint>(route.timeConstraint)
  const [totalMinutes, setTotalMinutes] = useState(String(route.timeConstraint.type === 'total_time' ? route.timeConstraint.minutes : 120))
  const [freeText, setFreeText] = useState(route.freeText)
  const [travelMode, setTravelMode] = useState<TravelMode>(route.travelMode)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  // edge-to-edge 表示では adjustResize が効かず、キーボードが入力欄とボタンを隠す。高さぶん下を空けて入力欄まで送る
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  // 失敗の表示を、戻った先の画面に持ち越さない
  const { clearError } = route
  useEffect(() => clearError, [clearError])

  const toggle = (chip: Preference) => setSelected((current) =>
    current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip],
  )

  return (
    <SafeAreaView style={[styles.safeArea, { paddingBottom: keyboardHeight }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.routeLabel}>{route.preview?.origin.name} → {route.preview?.destination.name}</Text>
        <Text style={styles.title}>どんな移動に{`\n`}したい？</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>移動手段</Text>
          <View style={styles.modeControl}>
            {travelModes.map((mode) => {
              const active = travelMode === mode.value
              return (
                <Pressable
                  key={mode.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTravelMode(mode.value)}
                  style={[styles.modeOption, active && styles.activeMode]}
                >
                  <Text style={[styles.modeText, active && styles.activeModeText]}>{mode.label}</Text>
                </Pressable>
              )
            })}
          </View>
          {travelMode !== 'driving' ? (
            <Text style={styles.routeWarning}>歩道や自転車道がルートに正確に反映されていない場合があります。</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>寄り道の希望</Text>
          <Text style={styles.help}>選ばなくてもOK・複数選べます</Text>
          <View style={styles.chips}>
            {chips.map((chip) => {
              const active = selected.includes(chip.value)
              return (
                <Pressable key={chip.value} onPress={() => toggle(chip.value)} style={[styles.chip, active && styles.activeChip]}>
                  <Text style={[styles.chipText, active && styles.activeChipText]}>{chip.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>自由に入力</Text>
          <TextInput
            multiline
            numberOfLines={4}
            maxLength={500}
            value={freeText}
            onChangeText={setFreeText}
            placeholder="例：海沿いを走って、途中で景色のいいカフェに寄りたい"
            placeholderTextColor="#CBD5E1"
            style={styles.input}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>どのくらい時間を使える？</Text>
          <View style={styles.timeGrid}>
            {timeOptions.map((option) => {
              const active = time.type === option.value.type && (
                option.value.type === 'none'
                || option.value.type === 'total_time'
                || (time.type === 'extra_time' && time.minutes === option.value.minutes)
              )
              return (
              <Pressable key={option.label} onPress={() => setTime(option.value)} style={[styles.timeOption, active && styles.activeTime]}>
                <Text style={[styles.timeText, active && styles.activeTimeText]}>{option.label}</Text>
              </Pressable>
              )
            })}
          </View>
          {time.type === 'total_time' ? (
            <View style={styles.totalTimeRow}>
              <TextInput
                value={totalMinutes}
                onChangeText={(value) => setTotalMinutes(value.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                style={styles.totalTimeInput}
                accessibilityLabel="合計時間"
              />
              <Text style={styles.totalTimeSuffix}>分以内</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {/* 生成は数秒で終わるので、専用のロード画面は出さずにボタンで待つ */}
          {route.error ? <Text accessibilityRole="alert" style={styles.errorText}>{route.error.message}</Text> : null}
          <PrimaryButton disabled={(time.type === 'total_time' && Number(totalMinutes) < 1)} loading={route.routeLoading} onPress={() => {
            Keyboard.dismiss()
            void route.createRoute({
              preferences: selected,
              freeText,
              timeConstraint: time.type === 'total_time' ? { type: 'total_time', minutes: Number(totalMinutes) } : time,
              travelMode,
            }).then((success) => {
              if (success) router.push('/result')
            })
          }}>AIでルートを作る</PrimaryButton>
          <Text style={styles.summary}>{selected.length === 0 ? 'おまかせ' : selected.map((value) => chips.find((chip) => chip.value === value)?.label).join('・')}で探します</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, padding: 24, gap: 10 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.ink, fontSize: 30, lineHeight: 31 },
  routeLabel: { color: colors.faint, fontSize: 12, marginTop: 2 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 35, fontWeight: '800', marginTop: 14 },
  help: { color: colors.faint, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  activeChip: { backgroundColor: colors.brand },
  chipText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  activeChipText: { color: colors.white },
  section: { marginTop: 20, gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  modeControl: { flexDirection: 'row', minHeight: 48, borderRadius: radius.medium, backgroundColor: '#F1F5F9', padding: 3 },
  modeOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.small },
  activeMode: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  modeText: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  activeModeText: { color: colors.ink },
  routeWarning: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  input: { minHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, padding: 14 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeOption: { width: '48%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.large, backgroundColor: '#F1F5F9', paddingHorizontal: 8 },
  activeTime: { backgroundColor: colors.ink },
  timeText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  activeTimeText: { color: colors.white },
  totalTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  totalTimeInput: { width: 96, height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, color: colors.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  totalTimeSuffix: { color: colors.text, fontSize: 14, fontWeight: '600' },
  footer: { gap: 10, marginTop: 26 },
  summary: { color: colors.faint, fontSize: 12, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
})
