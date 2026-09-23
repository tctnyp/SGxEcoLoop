import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Text } from './Typography';

type Props = { compact?: boolean; inverse?: boolean };

export function Logo({ compact = false, inverse = false }: Props) {
  return (
    <View style={styles.row} accessibilityLabel="novo">
      <View style={[styles.mark, compact && styles.markCompact, inverse && styles.markInverse]}>
        <View style={[styles.leaf, compact && styles.leafCompact]} />
      </View>
      <Text style={[styles.word, compact && styles.wordCompact, inverse && styles.wordInverse]}>novo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-7deg' }],
  },
  markCompact: { width: 34, height: 34, borderRadius: 13 },
  markInverse: { backgroundColor: colors.ink, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  leaf: {
    width: 17,
    height: 22,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: colors.lime,
    transform: [{ rotate: '20deg' }],
  },
  leafCompact: { width: 14, height: 18 },
  word: { color: colors.ink, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -1.5 },
  wordCompact: { fontSize: 25, lineHeight: 30 },
  wordInverse: { color: colors.surface },
});
