import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { AccessoryId } from '../types';
import { Text } from './Typography';

type Props = { size?: 'small' | 'large'; mood?: 'happy' | 'proud'; accessory?: AccessoryId };

export function Plushie({ size = 'large', mood = 'happy', accessory }: Props) {
  const small = size === 'small';
  return (
    <View style={[styles.wrap, small && styles.wrapSmall]} accessibilityLabel="A friendly green novo plushie">
      <View style={[styles.ear, styles.earLeft, small && styles.earSmall]} />
      <View style={[styles.ear, styles.earRight, small && styles.earSmall]} />
      {accessory && <AccessoryAdornment id={accessory} small={small} />}
      <View style={[styles.body, small && styles.bodySmall]}>
        <View style={[styles.face, small && styles.faceSmall]}>
          <View style={[styles.eye, small && styles.eyeSmall]} />
          <View style={[styles.eye, small && styles.eyeSmall]} />
        </View>
        <Text style={[styles.mouth, small && styles.mouthSmall]}>{mood === 'proud' ? '◡' : 'ᴗ'}</Text>
        {!small && <View style={styles.belly}><View style={styles.bellyLeaf} /></View>}
      </View>
      {!small && <View style={styles.spark}><Text style={styles.sparkText}>✦</Text></View>}
    </View>
  );
}

function AccessoryAdornment({ id, small }: { id: AccessoryId; small: boolean }) {
  if (id === 'sunny-cap') {
    return (
      <View style={[styles.cap, small && styles.capSmall]}>
        <View style={styles.capCrown} />
        <View style={styles.capBrim} />
      </View>
    );
  }
  if (id === 'trail-scarf') {
    return (
      <View style={[styles.scarf, small && styles.scarfSmall]}>
        <View style={styles.scarfKnot} />
        <View style={styles.scarfTail} />
      </View>
    );
  }
  return (
    <View style={[styles.flower, small && styles.flowerSmall]}>
      <Text style={[styles.flowerText, small && styles.flowerTextSmall]}>✿</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 178, height: 194, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  wrapSmall: { width: 76, height: 82 },
  body: {
    width: 148,
    height: 164,
    borderRadius: 70,
    borderBottomLeftRadius: 58,
    borderBottomRightRadius: 58,
    backgroundColor: colors.limeBright,
    borderWidth: 4,
    borderColor: colors.ink,
    alignItems: 'center',
    paddingTop: 49,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 6,
  },
  bodySmall: { width: 68, height: 73, borderRadius: 31, borderWidth: 2, paddingTop: 21 },
  ear: { position: 'absolute', top: 8, width: 48, height: 62, backgroundColor: colors.limeBright, borderWidth: 4, borderColor: colors.ink, zIndex: 0 },
  earLeft: { left: 19, borderTopLeftRadius: 40, borderBottomRightRadius: 32, transform: [{ rotate: '-24deg' }] },
  earRight: { right: 19, borderTopRightRadius: 40, borderBottomLeftRadius: 32, transform: [{ rotate: '24deg' }] },
  earSmall: { top: 3, width: 24, height: 29, borderWidth: 2 },
  face: { flexDirection: 'row', gap: 42 },
  faceSmall: { gap: 18 },
  eye: { width: 11, height: 15, borderRadius: 8, backgroundColor: colors.ink },
  eyeSmall: { width: 5, height: 7 },
  mouth: { color: colors.ink, fontSize: 28, fontWeight: '900', marginTop: -2 },
  mouthSmall: { fontSize: 14, marginTop: -3 },
  belly: { marginTop: 12, width: 58, height: 48, borderRadius: 26, backgroundColor: '#EBFBBF', alignItems: 'center', justifyContent: 'center' },
  bellyLeaf: { width: 18, height: 25, borderTopLeftRadius: 14, borderBottomRightRadius: 14, backgroundColor: colors.forest, transform: [{ rotate: '18deg' }] },
  spark: { position: 'absolute', right: 0, top: 22, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
  sparkText: { color: colors.coral, fontSize: 19, fontWeight: '900' },
  cap: { position: 'absolute', top: -3, left: 42, width: 96, height: 50, zIndex: 3, transform: [{ rotate: '-5deg' }] },
  capSmall: { top: -3, left: 18, width: 43, height: 25, transform: [{ scale: 0.78 }, { rotate: '-5deg' }] },
  capCrown: { width: 72, height: 37, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: '#FFC857', borderWidth: 3, borderColor: colors.ink },
  capBrim: { position: 'absolute', width: 53, height: 13, borderRadius: 9, right: 0, bottom: 2, backgroundColor: '#FFC857', borderWidth: 3, borderColor: colors.ink },
  scarf: { position: 'absolute', width: 130, height: 28, borderRadius: 16, backgroundColor: '#7C67B5', bottom: 25, zIndex: 4, borderWidth: 3, borderColor: colors.ink },
  scarfSmall: { width: 60, height: 14, bottom: 9, borderWidth: 2 },
  scarfKnot: { position: 'absolute', right: 14, bottom: -9, width: 22, height: 22, borderRadius: 8, backgroundColor: '#9B87D3', transform: [{ rotate: '18deg' }] },
  scarfTail: { position: 'absolute', right: 0, bottom: -27, width: 18, height: 37, borderRadius: 7, backgroundColor: '#7C67B5', transform: [{ rotate: '-14deg' }] },
  flower: { position: 'absolute', right: 15, top: 18, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF4A8', zIndex: 5, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  flowerSmall: { width: 24, height: 24, right: 2, top: 5, borderWidth: 2 },
  flowerText: { color: colors.coral, fontSize: 30, lineHeight: 34 },
  flowerTextSmall: { fontSize: 15, lineHeight: 18 },
});
