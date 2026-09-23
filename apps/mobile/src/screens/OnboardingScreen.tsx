import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DimensionValue, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { finishOnboarding } from '../api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Plushie } from '../components/Plushie';
import { TextField } from '../components/TextField';
import { Text } from '../components/Typography';
import { colors } from '../theme';
import { AuthResult } from '../types';

type Props = {
  draft?: { name: string; email: string };
  onBack: () => void;
  onComplete: (result: AuthResult) => Promise<void>;
};

const focuses = [
  { id: 'single-use', label: 'Skip single-use', icon: 'water-outline' as const },
  { id: 'food', label: 'Waste less food', icon: 'restaurant-outline' as const },
  { id: 'repair', label: 'Repair & reuse', icon: 'construct-outline' as const },
];

export function OnboardingScreen({ draft, onBack, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(draft?.name ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [plushieName, setPlushieName] = useState('');
  const [focus, setFocus] = useState('single-use');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const progress = useMemo<DimensionValue>(() => `${((step + 1) / 2) * 100}%`, [step]);

  const complete = async () => {
    const normalizedName = (name ?? '').trim();
    const normalizedPlushieName = (plushieName ?? '').trim();
    setLoading(true);
    setError('');
    try {
      await onComplete(await finishOnboarding({ name: normalizedName, email: email.trim(), plushieName: normalizedPlushieName, focus }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not create your profile. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.topbar}>
            <Pressable onPress={step === 0 ? onBack : () => setStep(0)} style={styles.back} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
            <Logo compact />
            <Text style={styles.step}>STEP {step + 1} OF 2</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: progress }]} /></View>

          <View style={styles.content}>
            {step === 0 ? (
              <>
                <View style={styles.plushieCard}>
                  <View style={styles.blob} />
                  <Plushie />
                </View>
                <Text style={styles.eyebrow}>YOUR LITTLE CHANGE-MAKER</Text>
                <Text style={styles.title}>Name your new pal</Text>
                <Text style={styles.body}>They’ll grow with every low-waste choice you make. What should we call you both?</Text>
                <View style={styles.fields}>
                  <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" icon="person-outline" />
                  <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="mail-outline" />
                  <TextField label="Plushie name" value={plushieName} onChangeText={setPlushieName} placeholder="Name your plushie" icon="leaf-outline" />
                </View>
                <Button label="Next: choose a focus" onPress={() => setStep(1)} disabled={!(name ?? '').trim() || !(plushieName ?? '').trim() || !email.includes('@')} icon="arrow-forward" />
              </>
            ) : (
              <>
                <View style={[styles.plushieCard, styles.focusCard]}>
                  <Plushie size="small" mood="proud" />
                  <View style={styles.bubble}>
                    <Text style={styles.bubbleText}>We’ve got this, {name.split(' ')[0]}!</Text>
                  </View>
                </View>
                <Text style={styles.eyebrow}>START SMALL, STAY CURIOUS</Text>
                <Text style={styles.title}>What feels doable?</Text>
                <Text style={styles.body}>Pick one focus for your first week. You can always change it later.</Text>
                <View style={styles.choices}>
                  {focuses.map((item) => {
                    const selected = focus === item.id;
                    return (
                      <Pressable key={item.id} onPress={() => setFocus(item.id)} style={[styles.choice, selected && styles.choiceSelected]}>
                        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><Ionicons name={item.icon} size={23} color={colors.ink} /></View>
                        <Text style={styles.choiceText}>{item.label}</Text>
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.forest : colors.outline} />
                      </Pressable>
                    );
                  })}
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Let’s grow" onPress={complete} loading={loading} icon="sparkles" />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  page: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', padding: 20, paddingBottom: 42 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center' },
  step: { color: colors.inkMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  progressTrack: { height: 7, backgroundColor: '#E2E8DC', borderRadius: 9, marginTop: 24, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.limeBright, borderRadius: 9 },
  content: { paddingTop: 30, gap: 14 },
  plushieCard: { height: 250, borderRadius: 34, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 16 },
  focusCard: { height: 152, backgroundColor: colors.peach, flexDirection: 'row', gap: 20 },
  blob: { position: 'absolute', width: 280, height: 180, borderRadius: 100, backgroundColor: '#D6C9FF', bottom: -75, transform: [{ rotate: '-6deg' }] },
  bubble: { maxWidth: 210, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: colors.surface, borderRadius: 20, borderBottomLeftRadius: 5 },
  bubbleText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  eyebrow: { color: colors.purple, fontSize: 13, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.3 },
  body: { color: colors.inkMuted, fontSize: 16, lineHeight: 23, marginBottom: 8 },
  fields: { gap: 15, marginVertical: 6 },
  choices: { gap: 12, marginVertical: 8 },
  choice: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline, borderRadius: 22, padding: 13 },
  choiceSelected: { borderColor: colors.forest, backgroundColor: '#F4FBE3' },
  choiceIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  choiceIconSelected: { backgroundColor: colors.lime },
  choiceText: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
