import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { colors, radius } from '@/constants/theme'

type Props = PropsWithChildren<{
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary'
}>

export function PrimaryButton({ children, onPress, disabled, loading, variant = 'primary' }: Props) {
  const secondary = variant === 'secondary'

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : styles.primary,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.muted : colors.white} />
      ) : (
        <Text style={[styles.label, secondary && styles.secondaryLabel]}>{children}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 20,
    borderRadius: radius.large,
  },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.white, fontSize: 16, fontWeight: '700' },
  secondaryLabel: { color: colors.muted },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.42 },
})
