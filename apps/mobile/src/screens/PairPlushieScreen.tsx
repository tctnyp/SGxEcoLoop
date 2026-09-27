import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Plushie } from '../components/Plushie';
import { Text } from '../components/Typography';
import { colors } from '../theme';
import { User } from '../types';
import { scanNovoPlushieTag } from '../nfc';

type Props = { user: User; onPair: (tagToken: string) => Promise<User>; onPaired: (user: User) => void; onSignOut: () => void };
type PairState = 'ready' | 'scanning' | 'success' | 'error';

export function PairPlushieScreen({ user, onPair, onPaired, onSignOut }: Props) {
  const [state, setState] = useState<PairState>('ready');
  const [error, setError] = useState('');
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'scanning') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, state]);

  const startPairing = async () => {
    setState('scanning');
    setError('');
    try {
      const tagToken = await scanNovoPlushieTag();
      const paired = await onPair(tagToken);
      setState('success');
      setTimeout(() => onPaired(paired), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not read the NFC tag.');
      setState('error');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.topbar}>
          <Logo compact />
          <Pressable onPress={onSignOut} style={styles.exit}><Text style={styles.exitText}>Sign out</Text></Pressable>
        </View>
        <View style={styles.progress}><View style={styles.progressDone} /></View>
        <View style={styles.copy}>
          <View style={styles.stepPill}><Text style={styles.stepText}>ONE LAST STEP</Text></View>
          <Text style={styles.title}>{state === 'success' ? 'You found each other!' : `Wake up ${user.plushieName}`}</Text>
          <Text style={styles.subtitle}>{state === 'success' ? `${user.plushieName} is now safely paired to your account.` : 'Hold your phone near the novo patch on your plushie. You’ll feel a little buzz when it connects.'}</Text>
        </View>
        <View style={styles.stage}>
          <View style={styles.stageBlob} />
          <Animated.View style={[styles.nfcRing, state === 'scanning' && { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }] }, state === 'success' && styles.successRing]}>
            <Ionicons name={state === 'success' ? 'checkmark' : 'radio-outline'} size={32} color={colors.forest} />
          </Animated.View>
          <Plushie mood={state === 'success' ? 'proud' : 'happy'} />
          <View style={styles.phone}><View style={styles.phoneSpeaker} /><Ionicons name="radio-outline" size={27} color={colors.forest} /></View>
        </View>
        <View style={styles.instructions}>
          <Instruction number="1" text="Unlock your phone" /><View style={styles.connector} />
          <Instruction number="2" text="Tap the novo patch" /><View style={styles.connector} />
          <Instruction number="3" text="Keep it still" />
        </View>
        <View style={styles.footer}>
          {state === 'error' && <Text style={styles.error}>{error}</Text>}
          {Platform.OS === 'web' && <Text style={styles.webNotice}>Install the Android or iOS app to pair the physical plushie.</Text>}
          <Button label={state === 'scanning' ? 'Looking for your plushie…' : state === 'success' ? 'Paired!' : Platform.OS === 'web' ? 'NFC needs the installed app' : 'Start NFC scan'} icon={state === 'success' ? 'checkmark-circle' : 'radio'} onPress={startPairing} loading={state === 'scanning'} disabled={state === 'success' || Platform.OS === 'web'} />
          <Text style={styles.help}>Can’t find the patch? It’s tucked beneath the left paw.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Instruction({ number, text }: { number: string; text: string }) {
  return <View style={styles.instruction}><View style={styles.instructionNumber}><Text style={styles.instructionNumberText}>{number}</Text></View><Text style={styles.instructionText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' }, page: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  topbar: { height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, exit: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99, backgroundColor: '#F1F4ED', justifyContent: 'center' }, exitText: { color: colors.inkMuted, fontWeight: '700', fontSize: 14 },
  progress: { height: 6, borderRadius: 9, backgroundColor: '#E5EAE1', overflow: 'hidden' }, progressDone: { width: '100%', height: '100%', backgroundColor: colors.limeBright },
  copy: { alignItems: 'center', marginTop: 26 }, stepPill: { backgroundColor: '#EDF8CF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 }, stepText: { color: colors.forest, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.2, textAlign: 'center', marginTop: 12 }, subtitle: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 430, marginTop: 8 },
  stage: { flex: 1, minHeight: 285, maxHeight: 350, alignItems: 'center', justifyContent: 'center', marginVertical: 8 }, stageBlob: { position: 'absolute', width: 310, height: 250, borderRadius: 120, backgroundColor: '#F1F7DF', transform: [{ rotate: '-5deg' }] },
  nfcRing: { position: 'absolute', right: '12%', top: '17%', width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: colors.forest, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 4 }, successRing: { backgroundColor: colors.lime, borderColor: colors.forest },
  phone: { position: 'absolute', left: '11%', bottom: '14%', width: 68, height: 108, borderRadius: 17, borderWidth: 3, borderColor: colors.ink, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], shadowColor: colors.shadow, shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.14, shadowRadius: 0, elevation: 3 }, phoneSpeaker: { position: 'absolute', top: 8, width: 20, height: 3, borderRadius: 2, backgroundColor: colors.ink },
  instructions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 12 }, instruction: { width: 94, alignItems: 'center', gap: 8 }, instructionNumber: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }, instructionNumberText: { color: colors.purple, fontWeight: '800', fontSize: 14 }, instructionText: { color: colors.inkMuted, fontWeight: '600', fontSize: 12, lineHeight: 16, textAlign: 'center' }, connector: { width: 26, height: 1.5, backgroundColor: '#DCE3D8', marginTop: 16 },
  footer: { gap: 12 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' }, webNotice: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' }, help: { color: colors.inkMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
