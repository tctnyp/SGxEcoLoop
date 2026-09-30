import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { finishOnboarding } from '../api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Plushie } from '../components/Plushie';
import { TextField } from '../components/TextField';
import { Text } from '../components/Typography';
import { colors } from '../theme';
import { AuthResult } from '../types';
import { isStrongPassword, PASSWORD_REQUIREMENTS, passwordIssue } from '../password';

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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focus, setFocus] = useState('single-use');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const progress = '33.333%' as const;

  const complete = async () => {
    const normalizedName = (name ?? '').trim();
    setLoading(true);
    setError('');
    try {
      const issue = passwordIssue(password);
      if (issue) throw new Error(issue);
      if (password !== confirmPassword) throw new Error('Passwords do not match.');
      await onComplete(await finishOnboarding({ name: normalizedName, email: email.trim(), password, focus }));
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
            <Pressable onPress={step === 0 ? onBack : () => setStep(0)} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
            <Logo compact />
            <Text style={styles.step}>ACCOUNT · 1 OF 3</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: progress }]} /></View>

          <View style={styles.content}>
            {step === 0 ? (
              <>
                <View style={styles.plushieCard}>
                  <View style={styles.blob} />
                  <Plushie />
                </View>
                <Text style={styles.eyebrow}>CREATE YOUR NOVO ID</Text>
                <Text style={styles.title}>Let’s get to know you</Text>
                <Text style={styles.body}>Profile {step + 1} of 2. Set up your account first. Your wristband colour will reveal your animal, then you’ll name your mascot together.</Text>
                <View style={styles.fields}>
                  <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" icon="person-outline" />
                  <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="mail-outline" />
                  <TextField label="Password" value={password} onChangeText={setPassword} placeholder="9+ characters" secure icon="lock-closed-outline" />
                  <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter it again" secure icon="shield-checkmark-outline" />
                  <View style={styles.passwordChecklist}>{PASSWORD_REQUIREMENTS.map((requirement) => { const met = requirement.test(password); return <View key={requirement.key} style={styles.passwordRequirement}><Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={met ? colors.forest : colors.inkMuted} /><Text style={[styles.passwordRequirementText, met && styles.passwordRequirementMet]}>{requirement.label}</Text></View>; })}<View style={styles.passwordRequirement}><Ionicons name={confirmPassword && password === confirmPassword ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={confirmPassword && password === confirmPassword ? colors.forest : colors.inkMuted} /><Text style={[styles.passwordRequirementText, Boolean(confirmPassword && password === confirmPassword) && styles.passwordRequirementMet]}>Passwords match</Text></View></View>
                  {draft?.email ? <Text style={styles.prefillHint}>Name and email were prefilled from your verified sign-in. You can correct them before continuing.</Text> : null}
                </View>
                <Button label="Next: choose a focus" onPress={() => setStep(1)} disabled={!(name ?? '').trim() || !email.includes('@') || !isStrongPassword(password) || password !== confirmPassword} icon="arrow-forward" />
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
                <View style={styles.neaCard}><Ionicons name="information-circle-outline" size={21} color={colors.forest} /><View style={{ flex: 1 }}><Text style={styles.neaTitle}>Singapore waste snapshot</Text><Text style={styles.neaText}>NEA reports 790,000 tonnes of food waste in 2025, with 18% recycled. Plastic waste was 957,000 tonnes in 2023, with 5% recycled.</Text><Text style={styles.neaSource}>Source: National Environment Agency · figures labelled by year</Text></View></View>
                <View style={styles.choices}>
                  {focuses.map((item) => {
                    const selected = focus === item.id;
                    return (
                      <Pressable key={item.id} onPress={() => setFocus(item.id)} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={item.label} style={[styles.choice, selected && styles.choiceSelected]}>
                        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><Ionicons name={item.icon} size={23} color={colors.ink} /></View>
                        <Text style={styles.choiceText}>{item.label}</Text>
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.forest : colors.outline} />
                      </Pressable>
                    );
                  })}
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Create account & pair wristband" onPress={complete} loading={loading} icon="radio-outline" />
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
  passwordChecklist: { gap: 6, paddingHorizontal: 4 },
  passwordRequirement: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  passwordRequirementText: { color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
  passwordRequirementMet: { color: colors.forest, fontWeight: '700' },
  prefillHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
  neaCard: { minHeight: 96, borderRadius: 20, padding: 13, backgroundColor: '#EDF6E6', borderWidth: 1, borderColor: '#D7E6D1', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  neaTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  neaText: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  neaSource: { color: colors.forest, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 4 },
  choices: { gap: 12, marginVertical: 8 },
  choice: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline, borderRadius: 22, padding: 13 },
  choiceSelected: { borderColor: colors.forest, backgroundColor: '#F4FBE3' },
  choiceIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  choiceIconSelected: { backgroundColor: colors.lime },
  choiceText: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
