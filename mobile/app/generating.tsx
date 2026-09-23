import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useRoute } from '@/context/RouteContext'

const steps = ['希望を分析中', 'ルート周辺を検索中', '寄り道候補を比較中', 'おすすめルートを作成中']

export default function GeneratingScreen() {
  const [activeStep, setActiveStep] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const { createRoute, error, clearError, routeLoading } = useRoute()

  useEffect(() => {
    let mounted = true
    setActiveStep(0)
    const timer = setInterval(() => setActiveStep((current) => Math.min(current + 1, steps.length - 1)), 900)
    void createRoute().then((success) => {
      if (mounted && success) router.replace('/result')
    }).finally(() => clearInterval(timer))
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [attempt, createRoute])

  const retry = () => {
    clearError()
    setAttempt((current) => current + 1)
  }

  const reviewInput = () => {
    const destination = error?.code === 'MAPS_URL_PARSE_FAILED' || error?.code === 'ROUTE_NOT_FOUND' || error?.code === 'LOCATION_UNAVAILABLE' ? '/' : '/preferences'
    clearError()
    router.replace(destination)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapBackdrop}>
        <View style={styles.water} />
        <View style={[styles.route, styles.routeOne]} />
        <View style={[styles.route, styles.routeTwo]} />
        {[0, 1, 2].map((item) => <View key={item} style={[styles.searchDot, { top: 175 + item * 95, left: 90 + item * 52 }]} />)}
      </View>
      <View style={styles.panel}>
        <Text style={styles.title}>{error ? 'ルートを作れませんでした' : 'あなた向けのルートを\n作っています'}</Text>
        {!error ? (
          <View style={styles.steps}>
            {steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepDot, index <= activeStep && styles.activeDot]} />
                <Text style={[styles.stepText, index <= activeStep && styles.activeText]}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorPanel}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error.message}</Text>
            {error.retryable ? <PrimaryButton loading={routeLoading} onPress={retry}>もう一度試す</PrimaryButton> : null}
            <PrimaryButton variant={error.retryable ? 'secondary' : 'primary'} onPress={reviewInput}>
              {error.code === 'MAPS_URL_PARSE_FAILED' || error.code === 'ROUTE_NOT_FOUND' ? '共有ルートに戻る' : '条件を見直す'}
            </PrimaryButton>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#EFF6FF' },
  mapBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  water: { position: 'absolute', right: 0, width: '45%', height: '100%', backgroundColor: '#DBEAFE' },
  route: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: colors.brand, transform: [{ rotate: '-62deg' }] },
  routeOne: { width: 280, left: -12, top: 330 },
  routeTwo: { width: 260, left: 132, top: 177 },
  searchDot: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, borderWidth: 5, borderColor: colors.brandSoft },
  panel: { position: 'absolute', left: 24, right: 24, bottom: 42, gap: 24 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 34, fontWeight: '800' },
  steps: { gap: 13 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#CBD5E1' },
  activeDot: { backgroundColor: colors.brand },
  stepText: { color: colors.faint, fontSize: 14 },
  activeText: { color: colors.text, fontWeight: '600' },
  errorPanel: { gap: 12, marginTop: 4 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
})
