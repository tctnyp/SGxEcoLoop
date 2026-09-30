import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { finishOnboarding } from '../api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Plushie } from '../components/Plushie';
import { TextField } from '../components/TextField';
import { Text } from '../components/Typography';
import { isStrongPassword, PASSWORD_REQUIREMENTS, passwordIssue } from '../password';
import { colors } from '../theme';
import { AuthResult, OAuthProvider } from '../types';

type Props = {
  draft?: AuthResult['draft'];
  onBack: () => void;
  onComplete: (result: AuthResult) => Promise<void>;
};

const providerNames: Record<OAuthProvider, string> = { google: 'Google', discord: 'Discord', microsoft: 'Microsoft' };
const providerIcons: Record<OAuthProvider, keyof typeof Ionicons.glyphMap> = { google: 'logo-google', discord: 'logo-discord', microsoft: 'logo-windows' };

export function OnboardingScreen({ draft, onBack, onComplete }: Props) {
  const [name, setName] = useState(draft?.name ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const oauthProvider = draft?.oauthProvider;
  const oauthOnboardingToken = draft?.oauthOnboardingToken;
  const oauthSignup = Boolean(oauthProvider && oauthOnboardingToken);

  const complete = async () => {
    const normalizedName = (name ?? '').trim();
    const normalizedEmail = (email ?? '').trim().toLowerCase();
    setLoading(true);
    setError('');
    try {
      if (!oauthSignup) {
        const issue = passwordIssue(password);
        if (issue) throw new Error(issue);
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
      }
      await onComplete(await finishOnboarding({
        name: normalizedName,
        email: normalizedEmail,
        ...(oauthSignup ? { oauthOnboardingToken } : { password }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not create your profile. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const formReady = Boolean((name ?? '').trim() && email.includes('@') && (oauthSignup || (isStrongPassword(password) && password === confirmPassword)));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to sign in">
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
            <Logo compact />
            <Text style={styles.step}>ACCOUNT · 1 OF 3</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 3, now: 1, text: 'Account setup, step 1 of 3' }} style={styles.progressTrack}><View style={styles.progressFill} /></View>

          <View style={styles.content}>
            <View style={styles.plushieCard}>
              <View style={styles.blob} />
              <Plushie size="small" mood="proud" />
              <View style={styles.journeyPill}><Ionicons name="radio-outline" size={14} color={colors.forest} /><Text style={styles.journeyPillText}>Account → wristband → mascot</Text></View>
            </View>
            <Text style={styles.eyebrow}>{oauthSignup ? `${providerNames[oauthProvider!].toUpperCase()} VERIFIED` : 'CREATE YOUR NOVO ID'}</Text>
            <Text accessibilityRole="header" style={styles.title}>{oauthSignup ? 'Complete your profile' : 'Start with your account'}</Text>
            <Text style={styles.body}>{oauthSignup ? 'Your email is verified. Add the name you want people to see, then pair your wristband.' : 'Create your account now. Your wristband colour will reveal your animal, and only then will you name your mascot.'}</Text>

            <View style={styles.neaCard}><Ionicons name="information-circle-outline" size={21} color={colors.forest} /><View style={{ flex: 1 }}><Text style={styles.neaTitle}>Singapore waste snapshot</Text><Text style={styles.neaText}>NEA reports 790,000 tonnes of food waste in 2025, with 18% recycled. Plastic waste was 957,000 tonnes in 2023, with 5% recycled.</Text><Text style={styles.neaSource}>Source: National Environment Agency · figures labelled by year</Text></View></View>

            <View style={styles.fields}>
              <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" icon="person-outline" />
              {oauthSignup ? (
                <View accessible accessibilityLabel={`${providerNames[oauthProvider!]} account verified as ${email}`} style={styles.verifiedAccount}>
                  <View style={styles.verifiedIcon}><Ionicons name={providerIcons[oauthProvider!]} size={21} color={colors.forest} /></View>
                  <View style={styles.verifiedCopy}><Text style={styles.verifiedLabel}>{providerNames[oauthProvider!]} account</Text><Text numberOfLines={1} style={styles.verifiedEmail}>{email}</Text></View>
                  <Ionicons name="checkmark-circle" size={23} color={colors.forest} />
                </View>
              ) : (
                <>
                  <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="mail-outline" />
                  <TextField label="Password" value={password} onChangeText={setPassword} placeholder="9+ characters" secure icon="lock-closed-outline" />
                  <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter it again" secure icon="shield-checkmark-outline" />
                  <View style={styles.passwordChecklist}>{PASSWORD_REQUIREMENTS.map((requirement) => { const met = requirement.test(password); return <View key={requirement.key} style={styles.passwordRequirement}><Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={met ? colors.forest : colors.inkMuted} /><Text style={[styles.passwordRequirementText, met && styles.passwordRequirementMet]}>{requirement.label}</Text></View>; })}<View style={styles.passwordRequirement}><Ionicons name={confirmPassword && password === confirmPassword ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={confirmPassword && password === confirmPassword ? colors.forest : colors.inkMuted} /><Text style={[styles.passwordRequirementText, Boolean(confirmPassword && password === confirmPassword) && styles.passwordRequirementMet]}>Passwords match</Text></View></View>
                </>
              )}
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label={oauthSignup ? 'Continue to wristband' : 'Create account & continue'} onPress={complete} loading={loading} disabled={!formReady} icon="arrow-forward" />
            <Text style={styles.footnote}>Your mascot name comes after the wristband reveals your animal.</Text>
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
  step: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  progressTrack: { height: 7, backgroundColor: '#E2E8DC', borderRadius: 9, marginTop: 22, overflow: 'hidden' },
  progressFill: { width: '33.333%', height: '100%', backgroundColor: colors.limeBright, borderRadius: 9 },
  content: { paddingTop: 24, gap: 13 },
  plushieCard: { position: 'relative', height: 190, borderRadius: 32, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 },
  blob: { position: 'absolute', width: 280, height: 150, borderRadius: 100, backgroundColor: '#D6C9FF', bottom: -70, transform: [{ rotate: '-6deg' }] },
  journeyPill: { position: 'absolute', bottom: 12, minHeight: 32, borderRadius: 99, paddingHorizontal: 11, backgroundColor: 'rgba(255,255,255,0.9)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  journeyPillText: { color: colors.forest, fontSize: 11, fontWeight: '800' },
  eyebrow: { color: colors.purple, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1.1 },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, marginBottom: 5 },
  fields: { gap: 14, marginVertical: 4 },
  verifiedAccount: { minHeight: 64, borderRadius: 19, borderWidth: 1.5, borderColor: '#BFCDB9', backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  verifiedIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EBF7C7', alignItems: 'center', justifyContent: 'center' },
  verifiedCopy: { flex: 1, minWidth: 0 },
  verifiedLabel: { color: colors.inkMuted, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  verifiedEmail: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 1 },
  passwordChecklist: { gap: 6, paddingHorizontal: 4 },
  passwordRequirement: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  passwordRequirementText: { color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
  passwordRequirementMet: { color: colors.forest, fontWeight: '700' },
  neaCard: { minHeight: 96, borderRadius: 20, padding: 13, backgroundColor: '#EDF6E6', borderWidth: 1, borderColor: '#D7E6D1', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  neaTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  neaText: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  neaSource: { color: colors.forest, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 4 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  footnote: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 18 },
});
