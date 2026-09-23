import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { AccessoryId } from '../types';
import { Text } from './Typography';

type Props = { accessory?: AccessoryId; name: string };

export function CalicoBear({ accessory, name }: Props) {
  const turn = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation>();
  const [turning, setTurning] = useState(true);

  useEffect(() => {
    if (!turning) {
      animation.current?.stop();
      return;
    }
    animation.current = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 16000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.current.start();
    return () => animation.current?.stop();
  }, [turn, turning]);

  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = turn.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.94, 1, 0.94, 1] });

  return (
    <Pressable
      onPress={() => setTurning((current) => !current)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, a natural calico bear${accessory ? ` wearing ${accessory}` : ''}. ${turning ? 'Pause' : 'Resume'} rotation.`}
      style={styles.stage}
    >
      <View style={styles.glow} />
      <View style={styles.shadow} />
      <Animated.View style={[styles.model, { transform: [{ perspective: 900 }, { rotateY }, { scale }] }]}>
        <View style={[styles.ear, styles.earLeft]}><View style={styles.earInner} /></View>
        <View style={[styles.ear, styles.earRight]}><View style={styles.earInner} /></View>
        <View style={[styles.arm, styles.armLeft]} />
        <View style={[styles.arm, styles.armRight]} />
        <View style={styles.body}>
          <View style={styles.bodyLight} />
          <View style={styles.belly} />
        </View>
        <View style={[styles.leg, styles.legLeft]}><View style={styles.pawPad} /></View>
        <View style={[styles.leg, styles.legRight]}><View style={styles.pawPad} /></View>
        <View style={styles.head}>
          <View style={styles.headLight} />
          <View style={styles.brow} />
          <View style={styles.eyes}><View style={styles.eye} /><View style={styles.eye} /></View>
          <View style={styles.muzzle}><View style={styles.nose} /><View style={styles.mouth} /></View>
          <View style={styles.stitch}><Text style={styles.stitchText}>· · ·</Text></View>
        </View>
        {accessory && <BearAccessory id={accessory} />}
      </Animated.View>
      <View style={styles.turnHint}><Text style={styles.turnHintText}>{turning ? '360°  tap to pause' : '▶  tap to rotate'}</Text></View>
    </Pressable>
  );
}

function BearAccessory({ id }: { id: AccessoryId }) {
  if (id === 'sunny-cap') {
    return <View style={styles.cap}><View style={styles.capTop} /><View style={styles.capBrim} /></View>;
  }
  if (id === 'trail-scarf') {
    return <View style={styles.scarf}><View style={styles.scarfKnot} /><View style={styles.scarfTail} /></View>;
  }
  return <View style={styles.flower}><Text style={styles.flowerText}>✿</Text></View>;
}

const fur = '#D8C19A';
const furDark = '#B79A70';
const furLight = '#EADABC';

const styles = StyleSheet.create({
  stage: { width: 300, height: 310, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  glow: { position: 'absolute', width: 255, height: 255, borderRadius: 128, backgroundColor: 'rgba(255,255,255,0.48)', top: 13 },
  shadow: { position: 'absolute', width: 164, height: 30, borderRadius: 82, backgroundColor: 'rgba(46,49,41,0.15)', bottom: 28, transform: [{ scaleX: 1.15 }] },
  model: { width: 210, height: 262, alignItems: 'center', position: 'relative' },
  ear: { position: 'absolute', top: 7, width: 61, height: 64, borderRadius: 31, backgroundColor: fur, borderWidth: 3, borderColor: '#66543C', zIndex: 0, alignItems: 'center', justifyContent: 'center' },
  earLeft: { left: 20, transform: [{ rotate: '-15deg' }] }, earRight: { right: 20, transform: [{ rotate: '15deg' }] },
  earInner: { width: 34, height: 36, borderRadius: 18, backgroundColor: '#CBAE83' },
  body: { position: 'absolute', width: 145, height: 142, borderRadius: 67, bottom: 24, backgroundColor: fur, borderWidth: 3, borderColor: '#66543C', overflow: 'hidden', zIndex: 2 },
  bodyLight: { position: 'absolute', width: 80, height: 145, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.18)', left: 5, top: -8 },
  belly: { position: 'absolute', width: 88, height: 95, borderRadius: 45, backgroundColor: furLight, left: 27, top: 33 },
  head: { position: 'absolute', width: 168, height: 145, borderRadius: 70, top: 32, backgroundColor: fur, borderWidth: 3, borderColor: '#66543C', overflow: 'hidden', alignItems: 'center', zIndex: 4, shadowColor: '#6A563F', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 5 },
  headLight: { position: 'absolute', width: 92, height: 155, borderRadius: 60, left: -6, top: -12, backgroundColor: 'rgba(255,255,255,0.18)', transform: [{ rotate: '8deg' }] },
  brow: { position: 'absolute', top: 33, width: 89, height: 28, borderRadius: 40, backgroundColor: 'rgba(183,154,112,0.25)' },
  eyes: { position: 'absolute', top: 51, flexDirection: 'row', gap: 48 }, eye: { width: 12, height: 17, borderRadius: 7, backgroundColor: '#2C302B', shadowColor: '#FFFFFF', shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.4, shadowRadius: 1 },
  muzzle: { position: 'absolute', top: 72, width: 79, height: 58, borderRadius: 35, backgroundColor: furLight, alignItems: 'center' }, nose: { marginTop: 9, width: 24, height: 17, borderRadius: 12, backgroundColor: '#4B4135', transform: [{ scaleX: 1.2 }] }, mouth: { width: 21, height: 11, borderBottomWidth: 2, borderColor: '#594A39', borderRadius: 12, marginTop: -1 },
  stitch: { position: 'absolute', right: 13, bottom: 13 }, stitchText: { color: furDark, fontSize: 11, letterSpacing: -1 },
  arm: { position: 'absolute', width: 48, height: 103, borderRadius: 28, backgroundColor: fur, borderWidth: 3, borderColor: '#66543C', bottom: 48, zIndex: 3 }, armLeft: { left: 12, transform: [{ rotate: '19deg' }] }, armRight: { right: 12, transform: [{ rotate: '-19deg' }] },
  leg: { position: 'absolute', width: 67, height: 62, borderRadius: 31, backgroundColor: fur, borderWidth: 3, borderColor: '#66543C', bottom: 5, zIndex: 5, alignItems: 'center', justifyContent: 'center' }, legLeft: { left: 29, transform: [{ rotate: '-5deg' }] }, legRight: { right: 29, transform: [{ rotate: '5deg' }] }, pawPad: { width: 35, height: 28, borderRadius: 18, backgroundColor: '#C2A47C' },
  cap: { position: 'absolute', top: -7, left: 52, width: 130, height: 66, zIndex: 8, transform: [{ rotate: '-5deg' }] }, capTop: { width: 95, height: 53, borderTopLeftRadius: 48, borderTopRightRadius: 48, backgroundColor: '#F7BD47', borderWidth: 3, borderColor: '#66543C' }, capBrim: { position: 'absolute', width: 72, height: 17, borderRadius: 10, right: 0, bottom: 0, backgroundColor: '#F7BD47', borderWidth: 3, borderColor: '#66543C' },
  scarf: { position: 'absolute', top: 152, left: 28, width: 154, height: 31, borderRadius: 17, backgroundColor: '#806BB6', borderWidth: 3, borderColor: '#594A78', zIndex: 7 }, scarfKnot: { position: 'absolute', right: 18, bottom: -9, width: 26, height: 26, borderRadius: 9, backgroundColor: '#9C87D0', transform: [{ rotate: '18deg' }] }, scarfTail: { position: 'absolute', right: 0, bottom: -47, width: 24, height: 57, borderRadius: 9, backgroundColor: '#806BB6', transform: [{ rotate: '-11deg' }] },
  flower: { position: 'absolute', right: 13, top: 35, width: 51, height: 51, borderRadius: 26, backgroundColor: '#FFF1B5', borderWidth: 3, borderColor: '#66543C', alignItems: 'center', justifyContent: 'center', zIndex: 8 }, flowerText: { color: '#E67567', fontSize: 31, lineHeight: 35 },
  turnHint: { position: 'absolute', bottom: 0, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }, turnHintText: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
