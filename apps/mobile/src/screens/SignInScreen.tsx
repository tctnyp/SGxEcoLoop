import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Keyboard, KeyboardAvoidingView, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkEmailStatus, continueWithGoogle, signIn } from '../api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Plushie } from '../components/Plushie';
import { TextField } from '../components/TextField';
import { Text } from '../components/Typography';
import { colors } from '../theme';
import { AuthResult } from '../types';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onAuthenticated: (result: AuthResult) => Promise<void>;
  onSignUp: () => void;
};

export function SignInScreen({ onAuthenticated, onSignUp }: Props) {
  const { width, height } = useWindowDimensions();
  const wide = width >= 860;
  const short = !wide && height < 760;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [heroCopyFrame, setHeroCopyFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [plushieFrame, setPlushieFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'email' | 'password' | 'google' | null>(null);
  const configuredGoogleClientId = Platform.select({ android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID }) ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const googleClientId = configuredGoogleClientId ?? 'not-configured.apps.googleusercontent.com';
  const [googleRequest, , promptGoogle] = Google.useIdTokenAuthRequest({ clientId: googleClientId, androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? googleClientId, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? googleClientId, webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? googleClientId, selectAccount: true });

  const captureFrame = (setter: typeof setHeroCopyFrame) => (event: LayoutChangeEvent) => setter(event.nativeEvent.layout);
  const constrained = !wide && (keyboardVisible || height < 620);
  const compactPlushieScale = constrained ? 0.5 : short ? 0.58 : 0.72;
  const visiblePlushieFrame = {
    x: plushieFrame.x + plushieFrame.width * (1 - compactPlushieScale) / 2,
    y: plushieFrame.y + plushieFrame.height * (1 - compactPlushieScale) / 2,
    width: plushieFrame.width * compactPlushieScale,
    height: plushieFrame.height * compactPlushieScale,
  };
  const overlapWidth = Math.min(heroCopyFrame.x + heroCopyFrame.width, visiblePlushieFrame.x + visiblePlushieFrame.width)
    - Math.max(heroCopyFrame.x, visiblePlushieFrame.x);
  const overlapHeight = Math.min(heroCopyFrame.y + heroCopyFrame.height, visiblePlushieFrame.y + visiblePlushieFrame.height)
    - Math.max(heroCopyFrame.y, visiblePlushieFrame.y);
  const posterElementsOverlap = heroCopyFrame.width > 0 && plushieFrame.width > 0 && overlapWidth > 12 && overlapHeight > 12;
  const hidePosterPlushie = !wide && (posterElementsOverlap || (constrained && width < 370));

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    setHeroCopyFrame({ x: 0, y: 0, width: 0, height: 0 });
    setPlushieFrame({ x: 0, y: 0, width: 0, height: 0 });
  }, [width, height, constrained]);

  const handleEmail = async () => {
    const normalizedEmail = (email ?? '').trim();
    if (!normalizedEmail.includes('@')) return setError('Enter a valid email address.');
    setError('');
    setLoading('email');
    try {
      const { exists } = await checkEmailStatus(normalizedEmail);
      if (exists) setStep('password');
      else await onAuthenticated(await signIn(normalizedEmail, 'continue'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not check that email.');
    } finally {
      setLoading(null);
    }
  };

  const handleSignIn = async () => {
    const normalizedEmail = (email ?? '').trim();
    const normalizedPassword = password ?? '';
    if (normalizedPassword.length < 6) return setError('Password must be at least 6 characters.');
    setError('');
    setLoading('password');
    try {
      await onAuthenticated(await signIn(normalizedEmail, normalizedPassword));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not sign you in.');
    } finally {
      setLoading(null);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading('google');
    try {
      const response = await promptGoogle();
      if (response.type !== 'success' || !response.params.id_token) throw new Error(response.type === 'dismiss' || response.type === 'cancel' ? 'Google sign-in was cancelled.' : 'Google did not return a verified identity.');
      await onAuthenticated(await continueWithGoogle(response.params.id_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in did not work.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.page, wide ? styles.pageWide : styles.pageCompact]}>
          <View style={[styles.hero, wide ? styles.heroWide : styles.heroCompact, short && styles.heroCompactShort, constrained && styles.heroCompactKeyboard]}>
            <View style={styles.heroTop}>
              <Logo inverse compact={!wide} />
              <View style={styles.pill}><Text style={styles.pillText}>small habits · real change</Text></View>
            </View>
            <View onLayout={captureFrame(setHeroCopyFrame)} style={[styles.heroCopy, short && styles.heroCopyShort, constrained && styles.heroCopyKeyboard]}>
              <Text style={[styles.eyebrow, short && styles.eyebrowShort]}>MEET YOUR PLANET PAL</Text>
              <Text accessibilityRole="header" style={[styles.heroTitle, short && styles.heroTitleShort, constrained && styles.heroTitleKeyboard]}>Less waste.{`\n`}More <Text style={[styles.heroAccent, short && styles.heroAccentShort, constrained && styles.heroTitleKeyboard]}>wonder.</Text></Text>
              <Text style={[styles.heroBody, short && styles.heroBodyShort, constrained && styles.heroBodyKeyboard]}>Grow better habits with a plushie that cheers on every refill, repair and rethink.</Text>
            </View>
            {!hidePosterPlushie && <View onLayout={captureFrame(setPlushieFrame)} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.plushieStage, wide ? styles.plushieStageWide : [short && styles.plushieStageShort, constrained && styles.plushieStageKeyboard, { transform: [{ scale: compactPlushieScale }] }]]}>
              <View style={[styles.stageCircle, wide && styles.stageCircleWide]} />
              <View style={styles.starOne}><Text>✦</Text></View>
              <View style={styles.starTwo}><Text>✦</Text></View>
              <Plushie />
            </View>}
            <Text style={[styles.heroFooter, wide && styles.heroFooterWide, short && styles.heroFooterShort]}>novo means “renew” — and every day is a fresh start.</Text>
          </View>

          <View style={[styles.panel, wide ? styles.panelWide : styles.panelCompact, short && styles.panelCompactShort, constrained && styles.panelCompactKeyboard]}>
            <View style={[styles.formHeader, constrained && styles.formHeaderKeyboard]}>
              <Text accessibilityRole="header" style={styles.title}>{step === 'email' ? (wide ? 'Welcome back' : 'Hello! 👋') : 'Welcome back'}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.subtitle}>{step === 'email' ? 'Ready to make today a little lighter?' : 'Enter your password to continue.'}</Text>
            </View>

            <View style={styles.form}>
              {step === 'email' ? <>
                {!constrained && <><Button label={configuredGoogleClientId ? 'Continue with Google' : 'Google sign-in needs setup'} icon="logo-google" variant="secondary" onPress={handleGoogle} loading={loading === 'google'} disabled={!configuredGoogleClientId || !googleRequest} /><View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>or continue with email</Text><View style={styles.line} /></View></>}
                <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" icon="mail-outline" error={error || undefined} />
                <Button label="Continue" onPress={handleEmail} loading={loading === 'email'} />
                {!constrained && <View style={styles.signupRow}>
                  <Text style={styles.accountText}>New to novo?</Text>
                  <Button label="Sign up" variant="text" onPress={onSignUp} />
                </View>}
              </> : <>
                <Pressable accessibilityRole="button" accessibilityLabel="Change email" onPress={() => { setStep('email'); setPassword(''); setError(''); }} style={styles.emailSummary}>
                  <View style={styles.emailSummaryCopy}><Text style={styles.emailSummaryLabel}>Signing in as</Text><Text numberOfLines={1} style={styles.emailSummaryValue}>{email.trim()}</Text></View>
                  <Text style={styles.changeEmail}>Change</Text>
                </Pressable>
                <TextField label="Password" value={password} onChangeText={setPassword} secure placeholder="At least 6 characters" icon="lock-closed-outline" error={error || undefined} />
                <Text style={styles.forgot}>Forgot password?</Text>
                <Button label="Sign in" onPress={handleSignIn} loading={loading === 'password'} />
              </>}
            </View>
            {(!constrained || wide) && <Text style={[styles.terms, wide ? styles.termsWide : styles.termsCompact]}>By continuing, you agree to our Terms and Privacy Policy.</Text>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pageCompact: { justifyContent: 'flex-start', backgroundColor: colors.forestDark },
  pageWide: { flexDirection: 'row', padding: 24, gap: 0 },
  hero: { width: '100%', maxWidth: 520, backgroundColor: colors.forestDark, padding: 26, overflow: 'hidden' },
  heroCompact: { maxWidth: 560, height: '49%', minHeight: 300, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34 },
  heroCompactShort: { height: '43%', minHeight: 270, paddingTop: 12, paddingBottom: 24 },
  heroCompactKeyboard: { height: '36%', minHeight: 184, paddingTop: 10, paddingBottom: 10 },
  heroWide: { width: '50%', maxWidth: 620, minHeight: 720, borderTopLeftRadius: 32, borderBottomLeftRadius: 32, padding: 42 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99 },
  pillText: { color: colors.lime, fontSize: 13, fontWeight: '700' },
  heroCopy: { marginTop: 18, maxWidth: 440, zIndex: 2 },
  heroCopyShort: { marginTop: 10, maxWidth: 215 },
  heroCopyKeyboard: { marginTop: 8, maxWidth: 208 },
  eyebrow: { color: colors.lime, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  eyebrowShort: { fontSize: 11, letterSpacing: 1.1 },
  heroTitle: { color: colors.surface, fontSize: 39, lineHeight: 40, fontWeight: '900', letterSpacing: -1.7, marginTop: 7 },
  heroTitleShort: { fontSize: 32, lineHeight: 33, letterSpacing: -1.3, marginTop: 5 },
  heroTitleKeyboard: { fontSize: 27, lineHeight: 28, letterSpacing: -1.1, marginTop: 4 },
  heroAccent: { color: colors.lime, fontSize: 39, lineHeight: 40, fontWeight: '900', letterSpacing: -1.7 },
  heroAccentShort: { fontSize: 32, lineHeight: 33, letterSpacing: -1.3 },
  heroBody: { color: '#E6F0EA', fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 8, maxWidth: 350 },
  heroBodyShort: { maxWidth: 205, fontSize: 12, lineHeight: 17, marginTop: 6 },
  heroBodyKeyboard: { fontSize: 12, lineHeight: 16, marginTop: 5 },
  plushieStage: { position: 'absolute', right: 18, bottom: 0, width: 178, height: 178, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  plushieStageShort: { right: 4, bottom: 12 },
  plushieStageKeyboard: { right: 2, bottom: 0 },
  plushieStageWide: { position: 'relative', right: 0, bottom: 0, width: '100%', height: 'auto', minHeight: 205, flex: 1, transform: [{ scale: 1 }] },
  stageCircle: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: '#376B56', opacity: 0.7 },
  stageCircleWide: { width: 238, height: 238, borderRadius: 119 },
  starOne: { position: 'absolute', left: 30, top: 50, backgroundColor: colors.peach, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }] },
  starTwo: { position: 'absolute', right: 28, bottom: 40, backgroundColor: colors.lavender, width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  heroFooter: { position: 'absolute', left: 22, bottom: 42, width: 150, color: '#D0DED5', fontSize: 11, lineHeight: 15, fontWeight: '500' },
  heroFooterWide: { position: 'relative', left: 0, bottom: 0, width: '100%', textAlign: 'center', fontSize: 12, lineHeight: 17 },
  heroFooterShort: { display: 'none' },
  panel: { position: 'relative', width: '100%', maxWidth: 520, backgroundColor: colors.cream },
  panelCompact: { flex: 1, maxWidth: 560, marginTop: -22, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 42, borderTopLeftRadius: 34, borderTopRightRadius: 34, zIndex: 3 },
  panelCompactShort: { paddingTop: 14, paddingBottom: 36 },
  panelCompactKeyboard: { paddingTop: 12, paddingBottom: 12 },
  panelWide: { width: '50%', maxWidth: 620, minHeight: 720, borderTopRightRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 70, justifyContent: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.08, shadowRadius: 30, elevation: 4 },
  formHeader: { marginBottom: 22 },
  formHeaderKeyboard: { marginBottom: 12 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  form: { gap: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: colors.outline },
  or: { color: colors.inkMuted, fontSize: 14, fontWeight: '600' },
  forgot: { color: colors.forest, fontSize: 15, fontWeight: '700', textAlign: 'right', marginTop: -7 },
  signupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  accountText: { color: colors.inkMuted, fontSize: 15 },
  emailSummary: { minHeight: 58, borderRadius: 19, borderWidth: 1.5, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emailSummaryCopy: { flex: 1 },
  emailSummaryLabel: { color: colors.inkMuted, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  emailSummaryValue: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 1 },
  changeEmail: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  terms: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  termsCompact: { position: 'absolute', left: 24, right: 24, bottom: 14 },
  termsWide: { marginTop: 18 },
});
