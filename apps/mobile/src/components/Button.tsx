import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { Text } from './Typography';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled }: Props) {
  const isPrimary = variant === 'primary';
  const isText = variant === 'text';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        isPrimary ? styles.primary : isText ? styles.text : styles.secondary,
        (pressed || hovered) && styles.hovered,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.surface : colors.ink} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons importantForAccessibility="no-hide-descendants" name={icon} size={20} color={isPrimary ? colors.surface : colors.ink} />}
          <Text style={[styles.label, isPrimary && styles.primaryLabel, isText && styles.textLabel]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  primary: { backgroundColor: colors.forest, shadowColor: colors.forestDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline },
  text: { backgroundColor: 'transparent', minHeight: 42 },
  hovered: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.52 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { color: colors.ink, fontWeight: '800', fontSize: 16, letterSpacing: 0.1 },
  primaryLabel: { color: colors.surface },
  textLabel: { color: colors.forest, fontSize: 15 },
});
