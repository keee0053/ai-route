import { useRef, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { PrimaryButton } from '@/components/PrimaryButton'
import { colors } from '@/constants/theme'

// Google公式の共通URL。インストール済みならMapsアプリ、なければブラウザで開く。
// https://developers.google.com/maps/documentation/urls/get-started
const GOOGLE_MAPS_URL = 'https://www.google.com/maps/@?api=1&map_action=map'

/** ルートをまだ共有していないユーザー向けの入口。既存の共有処理には触れない。 */
export function GoogleMapsEntry() {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState(false)

  const openGoogleMaps = async () => {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    setOpenError(false)

    try {
      await Linking.openURL(GOOGLE_MAPS_URL)
    } catch {
      setOpenError(true)
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text
        accessibilityRole="header"
        style={styles.title}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        Googleマップでルートを選ぶ
      </Text>

      <View style={styles.buttonArea}>
        <PrimaryButton loading={opening} onPress={() => void openGoogleMaps()}>
          Googleマップを開く
        </PrimaryButton>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.description}>
          利用したいルートを選んでください。
        </Text>

        <Text style={styles.description}>
          「共有」から「AIルート」を選ぶと、{'\n'}
          このアプリで続きを始められます。
        </Text>

        {openError ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
            Googleマップを開けませんでした。もう一度ボタンを押すか、ホーム画面からGoogleマップを開いてください。
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    justifyContent: 'space-evenly',
  },
  buttonArea: {
    width: '100%',
  },
  instructions: {
    gap: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 32,
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 26,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 20,
  },
})
