import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Platform, StyleSheet, View } from 'react-native'
import { ShareIntentProvider } from 'expo-share-intent'
import { RouteProvider } from '@/context/RouteContext'
import { ShareIntentBridge } from '@/components/ShareIntentBridge'

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ scheme: 'yorimichi' }}>
      <SafeAreaProvider>
        <RouteProvider>
          <ShareIntentBridge />
          <StatusBar style="dark" />
          <View style={styles.viewport}>
            <View style={styles.appFrame}>
              <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
            </View>
          </View>
        </RouteProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  )
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#E8EDF2' : '#FFFFFF',
    alignItems: 'center',
  },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 12px 34px rgba(15, 23, 42, 0.16)',
      },
      default: {},
    }),
  },
})
