import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { DimensionValue, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { PlushieScene } from '../components/PlushieScene';
import { TextField } from '../components/TextField';
import { Text } from '../components/Typography';
import { colors } from '../theme';
import { MascotType, User } from '../types';

type Props = {
  user: User;
  onComplete: (mascotName: string) => Promise<User>;
};

const lessons = [
  {
    eyebrow: 'MEET YOUR MASCOT',
    title: 'A new friend appeared',
    body: 'Your wristband colour chose this animal. Give your companion a name before you explore novo.',
  },
  {
    eyebrow: 'YOUR DAILY RITUAL',
    title: 'Tap once each day',
    body: 'Open Home and hold your wristband near the top of your phone. One daily tap refreshes quests and grows your streak.',
  },
  {
    eyebrow: 'ACT WITH PURPOSE',
    title: 'Complete real-world quests',
    body: 'Use the in-app camera for evidence, join nearby events, and find Return-Right machines on the Tasks map.',
  },
  {
    eyebrow: 'MAKE IT YOURS',
    title: 'Grow together',
    body: 'Earn leaves, unlock digital accessories, connect with friends and use rewards that support better habits.',
  },
];

const animalLabels: Record<MascotType, string> = {
  'polar-bear': 'Polar Bear',
  penguin: 'Penguin',
  fox: 'Fox',
  turtle: 'Turtle',
  bird: 'Bird',
};

const wristbandLabels: Record<User['wristbandColor'], string> = {
  'snowy-white': 'Snowy White',
  'charcoal-black': 'Charcoal Black',
  'sunset-orange': 'Sunset Orange',
  'tropical-green': 'Tropical Green',
  'ocean-blue': 'Ocean Blue',
};

export function TutorialScreen({ user, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [mascotName, setMascotName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lesson = lessons[step] ?? lessons[0]!;
  const progress = useMemo<DimensionValue>(() => `${66.666 + ((step + 1) / lessons.length) * 33.334}%`, [step]);

  const finish = async (name: string) => {
    setLoading(true);
    setError('');
    try {
      await onComplete(name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not finish the tutorial. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const next = async () => {
    const name = mascotName.trim();
    if (step === 0 && name.length > 30) return setError('Keep your mascot name to 30 characters or fewer.');
    if (step < lessons.length - 1) {
      setError('');
      setStep((current) => current + 1);
      return;
    }
    if (!name) return;
    await finish(name);
  };

  const skip = () => finish(mascotName.trim());

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        {step > 0 ? <Pressable onPress={() => setStep((current) => current - 1)} accessibilityRole="button" accessibilityLabel="Previous tutorial step" style={styles.roundButton}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable> : <Logo compact />}
        <Text style={styles.step}>{step === 0 ? 'MASCOT · 3 OF 3' : `GUIDE ${step + 1} OF ${lessons.length}`}</Text>
        {step > 0 && step < lessons.length - 1
          ? <Pressable onPress={() => void skip()} disabled={loading} accessibilityRole="button" accessibilityLabel="Skip the remaining guide" style={({ pressed }) => [styles.skip, pressed && styles.skipPressed, loading && styles.skipDisabled]}><Text style={styles.skipText}>Skip guide</Text></Pressable>
          : <View style={styles.topbarEndSpacer} />}
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: lessons.length, now: step + 1, text: `Guide step ${step + 1} of ${lessons.length}` }} style={styles.progressTrack}><View style={[styles.progressFill, { width: progress }]} /></View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 0 ? <View style={styles.mascotStage}>
          <View style={styles.halo} />
          <PlushieScene mascotType={user.mascotType} accessories={[]} autoRotate={false} />
          <View style={styles.revealPill}><Ionicons name="radio" size={15} color={colors.forest} /><Text style={styles.revealText}>{wristbandLabels[user.wristbandColor]} · {animalLabels[user.mascotType]}</Text></View>
        </View> : <TutorialIllustration step={step} mascotType={user.mascotType} />}
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{lesson.eyebrow}</Text>
          <Text style={styles.title}>{lesson.title}</Text>
          <Text style={styles.body}>{lesson.body}</Text>
        </View>
        {step === 0 ? <View style={styles.nameBlock}>
          <TextField label="Mascot name" value={mascotName} onChangeText={setMascotName} placeholder={`Name your ${animalLabels[user.mascotType].toLowerCase()}`} icon="leaf-outline" />
          <Text style={styles.nameHint}>Naming comes after pairing because your wristband decides which animal appears.</Text>
        </View> : <TutorialPoints step={step} />}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={step === lessons.length - 1 ? `Finish with ${mascotName.trim() || 'your mascot'}` : 'Next'} onPress={next} loading={loading} disabled={step === 0 && !mascotName.trim()} icon={step === lessons.length - 1 ? 'sparkles' : 'arrow-forward'} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function TutorialIllustration({ step, mascotType }: { step: number; mascotType: MascotType }) {
  const icon = step === 1 ? 'radio-outline' : step === 2 ? 'camera-outline' : 'leaf-outline';
  return <View style={[styles.illustration, step === 2 && styles.illustrationBlue, step === 3 && styles.illustrationPeach]}>
    <View style={styles.illustrationOrb}><Ionicons name={icon} size={46} color={colors.forest} /></View>
    <View style={styles.miniMascot}><PlushieScene mascotType={mascotType} accessories={step === 3 ? ['bright-star'] : []} autoRotate={false} compact /></View>
  </View>;
}

function TutorialPoints({ step }: { step: number }) {
  const points = step === 1
    ? [['flame-outline', 'One tap counts per day'], ['refresh-outline', 'Fresh quests after the tap'], ['notifications-outline', 'A gentle reminder if you forget']]
    : step === 2
      ? [['camera-outline', 'Capture evidence inside novo'], ['map-outline', 'Discover nearby events and machines'], ['shield-checkmark-outline', 'AI or staff verifies submissions']]
      : [['shirt-outline', 'Equip digital accessories'], ['people-outline', 'Share progress with friends'], ['gift-outline', 'Spend leaves on rewards and impact']];
  return <View style={styles.pointList}>{points.map(([icon, label]) => <View key={label} style={styles.pointRow}><View style={styles.pointIcon}><Ionicons name={icon as never} size={20} color={colors.forest} /></View><Text style={styles.pointText}>{label}</Text><Ionicons name="ellipse" size={7} color={colors.forest} /></View>)}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFCF7' },
  flex: { flex: 1 },
  topbar: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: { width: 42, height: 42, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE5D9', alignItems: 'center', justifyContent: 'center' },
  skip: { minWidth: 82, minHeight: 40, paddingHorizontal: 12, borderRadius: 99, backgroundColor: '#EFF3EC', alignItems: 'center', justifyContent: 'center' },
  skipPressed: { opacity: 0.72 },
  skipDisabled: { opacity: 0.45 },
  skipText: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  topbarEndSpacer: { width: 82, height: 40 },
  step: { color: colors.inkMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  progressTrack: { height: 6, marginHorizontal: 20, borderRadius: 99, backgroundColor: '#E4EAE0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.limeBright },
  page: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', padding: 20, paddingTop: 18, paddingBottom: 30, gap: 16 },
  mascotStage: { position: 'relative', height: 285, borderRadius: 34, backgroundColor: '#EEF6E5', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(211,246,91,0.38)' },
  revealPill: { position: 'absolute', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.92)' },
  revealText: { color: colors.forest, fontSize: 12, fontWeight: '800' },
  illustration: { position: 'relative', height: 230, borderRadius: 34, backgroundColor: '#EDF5DF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  illustrationBlue: { backgroundColor: '#E7F2F6' },
  illustrationPeach: { backgroundColor: '#FFF0DF' },
  illustrationOrb: { width: 104, height: 104, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  miniMascot: { position: 'absolute', right: -35, bottom: -35, width: 170, height: 170 },
  copy: { alignItems: 'center', paddingHorizontal: 8 },
  eyebrow: { color: colors.forest, fontSize: 11, fontWeight: '900', letterSpacing: 1.35 },
  title: { marginTop: 7, color: colors.ink, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.9, textAlign: 'center' },
  body: { marginTop: 8, maxWidth: 480, color: colors.inkMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  nameBlock: { gap: 7 },
  nameHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  pointList: { gap: 9 },
  pointRow: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E7DC', flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EBF7C7', alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, textAlign: 'center', fontWeight: '700' },
});
