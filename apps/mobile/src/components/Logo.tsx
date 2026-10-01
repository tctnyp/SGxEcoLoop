import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Text } from './Typography';

type Props = { compact?: boolean; inverse?: boolean };

export function Logo({ compact = false, inverse = false }: Props) {
  return (
    <View style={styles.row} accessibilityLabel="novo">
      <Image source={require('../../assets/icon.png')} style={[styles.mark, compact && styles.markCompact]} resizeMode="cover" />
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
  },
  markCompact: { width: 34, height: 34, borderRadius: 13 },
  word: { color: colors.ink, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -1.5 },
  wordCompact: { fontSize: 25, lineHeight: 30 },
  wordInverse: { color: colors.surface },
});
