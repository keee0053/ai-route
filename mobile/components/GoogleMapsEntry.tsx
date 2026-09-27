import { useEffect, useMemo, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  ArrowRight,
  ClipboardPaste,
  ExternalLink,
  Link2,
  Map,
} from 'lucide-react-native'

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/@?api=1&map_action=map'

type GoogleMapsEntryProps = {
  initialUrl?: string | null
  loading: boolean
  importError?: string | null
  onClearError: () => void
  onImportUrl: (url: string) => Promise<boolean>
}

function isGoogleMapsUrl(value: string) {
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    return (
      host === 'maps.app.goo.gl' ||
      host === 'maps.google.com' ||
      (host === 'goo.gl' && parsed.pathname.startsWith('/maps')) ||
      host.startsWith('maps.google.') ||
      (host.startsWith('google.') && parsed.pathname.startsWith('/maps'))
    )
  } catch {
    return false
  }
}

export function GoogleMapsEntry({
  initialUrl,
  loading,
  importError,
  onClearError,
  onImportUrl,
}: GoogleMapsEntryProps) {
  const { width } = useWindowDimensions()
  const openingRef = useRef(false)
  const seededUrlRef = useRef<string | null>(null)
  const [url, setUrl] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [pasting, setPasting] = useState(false)
  const hasUrl = url.trim().length > 0
  const error = localError ?? importError ?? null

  useEffect(() => {
    const nextUrl = initialUrl?.trim() ?? ''
    if (nextUrl && nextUrl !== seededUrlRef.current) {
      seededUrlRef.current = nextUrl
      setUrl(nextUrl)
    }
  }, [initialUrl])

  const dots = useMemo(() => {
    const columns = Math.max(10, Math.ceil(width / 30))
    return Array.from({ length: columns * 27 }, (_, index) => ({
      left: (index % columns) * 30 + 8,
      top: Math.floor(index / columns) * 30 + 7,
    }))
  }, [width])

  const updateUrl = (value: string) => {
    setUrl(value)
    setLocalError(null)
    onClearError()
  }

  const openGoogleMaps = async () => {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    setLocalError(null)

    try {
      await Linking.openURL(GOOGLE_MAPS_URL)
    } catch {
      setLocalError('Googleマップを開けませんでした')
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }

  const pasteUrl = async () => {
    if (pasting || loading) return
    setPasting(true)
    setLocalError(null)
    onClearError()

    try {
      const clipboardText = (await Clipboard.getStringAsync()).trim()
      if (!clipboardText) {
        setLocalError('クリップボードにURLがありません')
        return
      }
      setUrl(clipboardText)
    } catch {
      setLocalError('クリップボードを読み込めませんでした')
    } finally {
      setPasting(false)
    }
  }

  const importRoute = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || loading) return

    if (!isGoogleMapsUrl(trimmedUrl)) {
      setLocalError('GoogleマップのURLを入力してください')
      return
    }

    setLocalError(null)
    onClearError()
    await onImportUrl(trimmedUrl)
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {dots.map((dot, index) => <View key={index} style={[styles.dot, dot]} />)}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Googleマップでルートを選ぶ</Text>
          <Text style={styles.subtitle}>保存したルートを取り込んでナビを開始</Text>
        </View>

        <View style={styles.mainAction}>
          <View style={[styles.card, styles.openCard]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Googleマップを開く"
              accessibilityState={{ busy: opening, disabled: opening }}
              disabled={opening}
              onPress={() => void openGoogleMaps()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Map size={22} color="#FFFFFF" strokeWidth={2.3} />
              <Text adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={1} style={styles.primaryButtonText}>
                {opening ? '開いています...' : 'Googleマップを開く'}
              </Text>
              {opening
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <ExternalLink size={19} color="#FFFFFF" strokeWidth={2.3} />}
            </Pressable>
          </View>
        </View>

        <View accessibilityRole="text" style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>または</Text>
          <View style={styles.divider} />
        </View>

        <View style={[styles.card, styles.urlCard]}>
          <View style={[styles.inputShell, hasUrl && styles.inputShellActive, error && styles.inputShellError]}>
            <Link2 size={19} color={hasUrl ? '#0879E1' : '#8090A3'} strokeWidth={2.2} />
            <TextInput
              accessibilityLabel="Googleマップの共有URL"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              keyboardType="url"
              onChangeText={updateUrl}
              onSubmitEditing={() => void importRoute()}
              placeholder="共有URLを貼り付け"
              placeholderTextColor="#8292A5"
              returnKeyType="go"
              selectTextOnFocus
              style={styles.input}
              value={url}
            />
            {hasUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Googleマップのルートを読み込む"
                accessibilityState={{ busy: loading, disabled: loading }}
                disabled={loading}
                hitSlop={8}
                onPress={() => void importRoute()}
                style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.5} />}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="クリップボードからURLをペースト"
                accessibilityState={{ busy: pasting }}
                hitSlop={8}
                onPress={() => void pasteUrl()}
                style={({ pressed }) => [styles.pasteButton, pressed && styles.pasteButtonPressed]}
              >
                <ClipboardPaste size={15} color="#0879E1" strokeWidth={2.2} />
                <Text style={styles.pasteText}>{pasting ? '確認中' : 'ペースト'}</Text>
              </Pressable>
            )}
          </View>

          {error ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 700, overflow: 'hidden', backgroundColor: '#F0F7FF' },
  dot: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#CFE3F7', opacity: 0.72 },
  content: { flex: 1, maxWidth: 520, alignSelf: 'stretch', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 36, gap: 18 },
  header: { alignItems: 'center', gap: 8, marginBottom: 2 },
  title: { color: '#1D232C', fontSize: 24, fontWeight: '800', lineHeight: 32, textAlign: 'center' },
  subtitle: { color: '#5F6F82', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  card: { padding: 18, gap: 15, borderWidth: 1, borderColor: '#E2EEFC', borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#44719B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 2 },
  mainAction: { flex: 1, justifyContent: 'center' },
  openCard: { padding: 18 },
  urlCard: { padding: 14, gap: 9 },
  primaryButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#0783F2' },
  primaryButtonText: { flexShrink: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  buttonPressed: { opacity: 0.78 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
  divider: { flex: 1, height: 1, backgroundColor: '#D8E7F5' },
  dividerText: { color: '#77889A', fontSize: 12, fontWeight: '600' },
  inputShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 9, borderWidth: 1, borderColor: '#DCE8F3', borderRadius: 12, backgroundColor: '#F4F9FD' },
  inputShellActive: { borderColor: '#49A4F4', backgroundColor: '#F8FCFF' },
  inputShellError: { borderColor: '#D94C4C' },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 10, color: '#1D232C', fontSize: 14 },
  pasteButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#E5F2FF' },
  pasteButtonPressed: { backgroundColor: '#D4E9FC' },
  pasteText: { color: '#0879E1', fontSize: 12, fontWeight: '700' },
  submitButton: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0783F2' },
  errorText: { marginTop: -5, color: '#C83838', fontSize: 12, lineHeight: 18 },
})
