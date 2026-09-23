import { useCallback, useEffect, useState } from 'react'
import { router } from 'expo-router'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/components/PrimaryButton'
import { colors, radius } from '@/constants/theme'
import { getHealth } from '@/services/api'
import { useRoute } from '@/context/RouteContext'

type ConnectionState = 'checking' | 'online' | 'offline'

export default function SharedRouteScreen() {
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [mapError, setMapError] = useState<string | null>(null)
  const { googleMapsUrl, preview, previewLoading, error, receiveSharedUrl } = useRoute()

  const checkConnection = useCallback(() => {
    setConnection('checking')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    getHealth(controller.signal)
      .then(() => setConnection('online'))
      .catch(() => setConnection('offline'))
      .finally(() => clearTimeout(timeout))
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const cancel = checkConnection()
    return () => {
      cancel()
    }
  }, [checkConnection])

  useEffect(() => {
    if (googleMapsUrl && !preview && !previewLoading && !error) void receiveSharedUrl(googleMapsUrl)
  }, [error, googleMapsUrl, preview, previewLoading, receiveSharedUrl])

  const openSharedMap = async () => {
    if (!googleMapsUrl) return
    setMapError(null)
    try {
      await Linking.openURL(googleMapsUrl)
    } catch {
      try {
        await WebBrowser.openBrowserAsync(googleMapsUrl)
      } catch {
        setMapError('Google Mapsを開けませんでした。時間をおいてもう一度お試しください。')
      }
    }
  }

  const originName = preview?.origin.name ?? 'Google Mapsから共有してください'
  const destinationName = preview?.destination.name ?? (googleMapsUrl ? '目的地を読み込みます' : 'Googleマップで経路を出し「共有」からこのアプリを選ぶ')
  const duration = preview ? `約${preview.normalRoute.durationMinutes}分` : '—'
  const distance = preview ? `${(preview.normalRoute.distanceMeters / 1000).toFixed(1)} km` : '—'

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.map}>
          <View style={styles.water} />
          <View style={[styles.routeLine, styles.routeLineOne]} />
          <View style={[styles.routeLine, styles.routeLineTwo]} />
          <View style={[styles.dot, styles.originDot]} />
          <View style={[styles.dot, styles.destinationDot]} />
          <View style={styles.receivedBadge}>
            <View style={styles.badgeIcon}><Text style={styles.badgeIconText}>G</Text></View>
            <View>
              <Text style={styles.badgeEyebrow}>Google Mapsから共有</Text>
              <Text style={styles.badgeTitle}>
                {previewLoading ? 'ルートを確認中' : preview ? 'ルートを受け取りました' : error ? 'ルートを確認できません' : 'ルートを共有してください'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.headingBlock}>
            <Text style={styles.eyebrow}>ROUTE RECEIVED</Text>
            <Text style={styles.title}>このルートを{`\n`}もっと楽しむ</Text>
          </View>

          <View style={styles.routeCard}>
            <View style={styles.locationRow}>
              <View style={styles.timeline}>
                <View style={[styles.timelineDot, { backgroundColor: colors.brand }]} />
                <View style={styles.timelineLine} />
                <View style={[styles.timelineDot, { backgroundColor: colors.ink }]} />
              </View>
              <View style={styles.locations}>
                <View><Text style={styles.label}>出発地</Text><Text style={styles.location}>{originName}</Text></View>
                <View><Text style={styles.label}>目的地</Text><Text style={styles.location}>{destinationName}</Text></View>
              </View>
            </View>
            <View style={styles.metrics}>
              <View style={styles.metric}><Text style={styles.label}>通常ルート</Text><Text style={styles.metricValue}>{duration}</Text></View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}><Text style={styles.label}>距離</Text><Text style={styles.metricValue}>{distance}</Text></View>
            </View>
          </View>

          <View style={styles.connectionRow}>
            <View style={[styles.connectionDot, connection === 'online' ? styles.online : connection === 'offline' ? styles.offline : styles.checking]} />
            <Text style={styles.connectionText}>
              {connection === 'online' ? 'サービスに接続済み' : connection === 'offline' ? 'オフライン。Mock画面は確認できます' : '接続を確認中'}
            </Text>
            {connection === 'offline' ? <Pressable accessibilityRole="button" onPress={checkConnection}><Text style={styles.retryLink}>再接続</Text></Pressable> : null}
          </View>

          {error ? (
            <View style={styles.errorBlock}>
              <Text accessibilityRole="alert" style={styles.errorText}>{error.message}</Text>
              {error.retryable && googleMapsUrl ? (
                <PrimaryButton variant="secondary" loading={previewLoading} onPress={() => void receiveSharedUrl(googleMapsUrl)}>もう一度読み込む</PrimaryButton>
              ) : null}
            </View>
          ) : null}
          {mapError ? <Text accessibilityRole="alert" style={styles.errorText}>{mapError}</Text> : null}

          <View style={styles.actions}>
            <PrimaryButton disabled={!preview} loading={previewLoading} onPress={() => router.push('/preferences')}>ルートをアレンジする</PrimaryButton>
            <PrimaryButton disabled={!googleMapsUrl} variant="secondary" onPress={openSharedMap}>Google Mapsで開く</PrimaryButton>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1 },
  map: { height: 300, overflow: 'hidden', backgroundColor: '#E8F4F8' },
  water: { position: 'absolute', right: 0, width: '42%', height: '100%', backgroundColor: '#D8EAF9' },
  routeLine: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: colors.white, transform: [{ rotate: '-43deg' }] },
  routeLineOne: { width: 190, left: 40, top: 188 },
  routeLineTwo: { width: 128, left: 170, top: 108 },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.white },
  originDot: { left: 49, top: 245, backgroundColor: colors.brand },
  destinationDot: { right: 76, top: 51, backgroundColor: colors.ink },
  receivedBadge: { position: 'absolute', top: 18, left: 18, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.medium, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 },
  badgeIcon: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  badgeIconText: { color: colors.white, fontWeight: '800' },
  badgeEyebrow: { color: colors.faint, fontSize: 10 },
  badgeTitle: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 2 },
  body: { flex: 1, padding: 24, gap: 22 },
  headingBlock: { gap: 5 },
  eyebrow: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 28, lineHeight: 35, fontWeight: '800' },
  routeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: 20 },
  locationRow: { flexDirection: 'row', gap: 16 },
  timeline: { width: 14, alignItems: 'center', paddingVertical: 5 },
  timelineDot: { width: 12, height: 12, borderRadius: 6 },
  timelineLine: { width: 1, height: 37, backgroundColor: '#CBD5E1', marginVertical: 4 },
  locations: { flex: 1, gap: 16 },
  label: { color: colors.faint, fontSize: 11, marginBottom: 3 },
  location: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 20, borderTopColor: colors.border, borderTopWidth: 1, marginTop: 18, paddingTop: 16 },
  metric: { minWidth: 90 },
  metricValue: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  metricDivider: { width: 1, backgroundColor: colors.border },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  online: { backgroundColor: colors.success },
  offline: { backgroundColor: colors.danger },
  checking: { backgroundColor: colors.faint },
  connectionText: { color: colors.muted, fontSize: 12 },
  retryLink: { color: colors.brandDark, fontSize: 12, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 4 },
  errorBlock: { gap: 10 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  actions: { gap: 10, marginTop: 'auto' },
})
