import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  addFriend,
  completeMemberOnboarding,
  contributePoints,
  deleteMemberAccount,
  equipAccessory,
  exchangeMobileHandoff,
  interactWithWristband,
  pairWristband,
  purchaseAccessory,
  reserveWristbandPickup,
  redeemCoupon,
  getWristbandPickupLocations,
  revokeSession,
  restoreMobileSession,
  setAccountStatusListener,
  startShowcaseDemo,
  startLinkedAccount,
  updateMemberProfile,
  changeMemberPassword,
  updateNotificationPreferences,
  unpairWristband,
  warmAppCache,
} from './src/api';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { sendLocalNotification, syncNotificationSchedule } from './src/notifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PairWristbandScreen } from './src/screens/PairWristbandScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { TutorialScreen } from './src/screens/TutorialScreen';
import { AccessoryId, AccountStatus, AuthResult, OAuthProvider, Screen, User } from './src/types';
import { colors } from './src/theme';

const SESSION_KEY = 'novo-mobile-session';
const LAST_PROFILE_KEY = 'novo-last-profile';
const profileKey = (email: string) => `novo-profile:${email.toLowerCase()}`;
const homeGuideKey = (userId: string) => `novo-home-guide:${userId}`;
const isShowcaseDemo = () => Platform.OS === 'web'
  && typeof window !== 'undefined'
  && /^\/demo\/?$/.test(window.location.pathname);

function StartupScreen({ introComplete, message, ready, onIntroComplete, onExitComplete }: { introComplete: boolean; message: string; ready: boolean; onIntroComplete: () => void; onExitComplete: () => void }) {
  const fall = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(fall, { toValue: 1, duration: 1_050, easing: Easing.bezier(0.16, 0.76, 0.26, 1), useNativeDriver: true }),
      Animated.spring(reveal, { toValue: 1, damping: 16, stiffness: 150, mass: 0.72, useNativeDriver: false }),
    ]);
    animation.start(({ finished }) => { if (finished) onIntroComplete(); });
    return () => animation.stop();
  }, [fall, onIntroComplete, reveal]);

  useEffect(() => {
    if (!ready) return undefined;
    const animation = Animated.timing(exit, { toValue: 1, duration: 460, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    const timeout = setTimeout(() => animation.start(({ finished }) => { if (finished) onExitComplete(); }), 90);
    return () => { clearTimeout(timeout); animation.stop(); };
  }, [exit, onExitComplete, ready]);

  const markRotation = fall.interpolate({ inputRange: [0, 0.18, 0.38, 0.58, 0.76, 0.9, 1], outputRange: ['-42deg', '24deg', '-18deg', '13deg', '-8deg', '4deg', '0deg'] });
  const markX = fall.interpolate({ inputRange: [0, 0.18, 0.38, 0.58, 0.76, 0.9, 1], outputRange: [-34, 27, -20, 14, -8, 4, 0] });
  const markY = fall.interpolate({ inputRange: [0, 0.82, 0.91, 0.97, 1], outputRange: [-430, 12, -7, 3, 0] });
  const markScale = fall.interpolate({ inputRange: [0, 0.74, 0.88, 1], outputRange: [0.76, 1.06, 0.96, 1] });

  return <Animated.View style={[styles.startupScreen, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }] }]} accessibilityLabel={introComplete ? message : 'novo is starting'}>
    <StatusBar style="light" />
    <View style={styles.startupStage}>
      <View style={styles.startupLockup}>
        <Animated.View style={[styles.startupMark, { transform: [{ translateX: markX }, { translateY: markY }, { rotate: markRotation }, { scale: markScale }] }]}>
          <View style={styles.startupLeaf}>
            <View style={styles.startupLeafVein} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.startupWordReveal, { width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, 112] }), opacity: reveal }]}>
          <Text numberOfLines={1} style={styles.startupWord}>novo</Text>
        </Animated.View>
      </View>
    </View>
    {introComplete ? <View style={styles.startupLoader} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color="#DFFC76" /><Text style={styles.startupMessage}>{message}</Text><Text style={styles.startupHint}>Preparing your map, quests and rewards</Text></View> : <View style={styles.startupLoaderPlaceholder} />}
  </Animated.View>;
}

function NovoApp() {
  const [fontsLoaded] = useFonts({ GoogleSansFlex: require('./assets/fonts/GoogleSansFlex-Regular.ttf') });
  const [screen, setScreen] = useState<Screen>('signin');
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<AuthResult['draft']>();
  const [booting, setBooting] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [showHomeGuide, setShowHomeGuide] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [loaderDwellComplete, setLoaderDwellComplete] = useState(false);
  const [startupVisible, setStartupVisible] = useState(true);
  const [bootMessage, setBootMessage] = useState('Connecting to novo…');
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const tokenRef = useRef<string | null>(null);
  const pendingFriendRef = useRef<string | null>(null);
  const screenRef = useRef<Screen>('signin');

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
    const timeout = setTimeout(() => setLoaderDwellComplete(true), 420);
    return () => clearTimeout(timeout);
  }, []);

  const appReady = Boolean(fontsLoaded && !booting && introComplete && loaderDwellComplete);
  useEffect(() => {
    if (!appReady) return;
    Animated.timing(contentOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [appReady, contentOpacity]);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const root = document.getElementById('root');
    const previous = {
      htmlHeight: document.documentElement.style.height,
      bodyHeight: document.body.style.height,
      bodyMargin: document.body.style.margin,
      bodyOverflow: document.body.style.overflow,
      rootHeight: root?.style.height ?? '',
      rootOverflow: root?.style.overflow ?? '',
    };
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    if (root) {
      root.style.height = '100%';
      root.style.overflow = 'hidden';
    }
    return () => {
      document.documentElement.style.height = previous.htmlHeight;
      document.body.style.height = previous.bodyHeight;
      document.body.style.margin = previous.bodyMargin;
      document.body.style.overflow = previous.bodyOverflow;
      if (root) {
        root.style.height = previous.rootHeight;
        root.style.overflow = previous.rootOverflow;
      }
    };
  }, []);

  const saveUser = async (nextUser: User) => {
    setUser(nextUser);
    const serialized = JSON.stringify(nextUser);
    await AsyncStorage.multiSet([[profileKey(nextUser.email), serialized], [LAST_PROFILE_KEY, serialized]]);
  };

  const routeUser = async (nextUser: User) => {
    await saveUser(nextUser);
    void syncNotificationSchedule(nextUser.notificationPreferences).catch(() => undefined);
    if (!nextUser.wristbandPaired) setScreen('pair-wristband');
    else if (nextUser.onboardingCompleted === false) setScreen('tutorial');
    else {
      setShowHomeGuide(await AsyncStorage.getItem(homeGuideKey(nextUser.id)) === 'pending');
      setScreen('home');
    }
  };

  const rememberSession = async (token: string) => {
    tokenRef.current = token;
    await AsyncStorage.setItem(SESSION_KEY, token);
  };

  const clearSession = async (revokeOnServer = true) => {
    const token = tokenRef.current ?? await AsyncStorage.getItem(SESSION_KEY);
    if (revokeOnServer && token) await revokeSession(token).catch(() => undefined);
    const activeUser = user;
    tokenRef.current = null;
    await AsyncStorage.multiRemove([SESSION_KEY, LAST_PROFILE_KEY, ...(activeUser ? [profileKey(activeUser.email)] : [])]);
    setUser(null);
    setDraft(undefined);
    setAccountStatus('active');
    setShowHomeGuide(false);
    setScreen('signin');
  };

  const handleAuth = async (result: AuthResult) => {
    if (result.isNewUser) {
      setDraft(result.draft);
      setScreen('onboarding');
      return;
    }

    if (!result.user || !result.token) throw new Error('The server did not return a complete novo session.');
    setAccountStatus(result.accountStatus ?? 'active');
    await rememberSession(result.token);
    await routeUser(result.user);
  };

  useEffect(() => setAccountStatusListener((status) => {
    setAccountStatus(status);
    if (status === 'suspended' && tokenRef.current) setScreen('account-status');
  }), []);

  useEffect(() => {
    let mounted = true;

    const exchangeHandoffUrl = async (url: string | null) => {
      if (!url) return false;
      const match = url.match(/^novo:\/\/auth\/handoff\?(?:[^#]*&)?token=([^&#]+)/);
      const handoffToken = match?.[1] ? decodeURIComponent(match[1]) : null;
      if (!handoffToken) return false;
      await handleAuth(await exchangeMobileHandoff(handoffToken));
      return true;
    };

    const captureFriendInvite = (url: string | null) => {
      if (!url) return null;
      const deepLinkMatch = url.match(/^novo:\/\/friends\/add\?(?:[^#]*&)?user=([^&#]+)/);
      const webLinkMatch = url.match(/^https?:\/\/[^/]+\/invite\/([^/?#]+)/);
      const encodedFriendId = deepLinkMatch?.[1] ?? webLinkMatch?.[1];
      const friendId = encodedFriendId ? decodeURIComponent(encodedFriendId) : null;
      if (friendId) pendingFriendRef.current = friendId;
      return friendId;
    };

    const acceptPendingFriend = async () => {
      const token = tokenRef.current;
      const friendId = pendingFriendRef.current;
      if (!token || !friendId) return;
      pendingFriendRef.current = null;
      await saveUser(await addFriend(token, friendId));
      Alert.alert('Friend added', 'Your novo circles are now connected.');
    };

    const restore = async () => {
      try {
        const demoMode = isShowcaseDemo();
        const storedToken = demoMode ? null : await AsyncStorage.getItem(SESSION_KEY);
        while (mounted) {
          try {
            setBootMessage('Loading your novo world…');
            await warmAppCache(storedToken ?? undefined);
            break;
          } catch {
            setBootMessage('Waiting for a secure connection…');
            await new Promise((resolve) => setTimeout(resolve, 3_000));
          }
        }
        if (!mounted) return;
        if (demoMode) {
          while (mounted) {
            try {
              setBootMessage('Opening the novo demo…');
              const demoSession = await startShowcaseDemo();
              if (demoSession.token) await warmAppCache(demoSession.token);
              await handleAuth(demoSession);
              return;
            } catch {
              setBootMessage('Preparing the demo account…');
              await new Promise((resolve) => setTimeout(resolve, 3_000));
            }
          }
          return;
        }
        setBootMessage('Restoring your progress…');
        const initialUrl = await Linking.getInitialURL();
        if (await exchangeHandoffUrl(initialUrl)) return;
        captureFriendInvite(initialUrl);

        if (!storedToken) return;
        try {
          const result = await restoreMobileSession(storedToken);
          if (!result.user) throw new Error('Profile missing from session.');
          setAccountStatus(result.accountStatus ?? 'active');
          await rememberSession(storedToken);
          await routeUser(result.user);
          await acceptPendingFriend();
        } catch (error) {
          if (error instanceof ApiError && error.accountStatus === 'suspended') {
            const cachedProfile = await AsyncStorage.getItem(LAST_PROFILE_KEY);
            if (cachedProfile) setUser(JSON.parse(cachedProfile) as User);
            await rememberSession(storedToken);
            setAccountStatus('suspended');
            setScreen('account-status');
            return;
          }
          if (error instanceof ApiError && error.status === 401) {
            await clearSession(false);
            return;
          }
          const cachedProfile = await AsyncStorage.getItem(LAST_PROFILE_KEY);
          if (!cachedProfile) throw error;
          const cachedUser = JSON.parse(cachedProfile) as User;
          await rememberSession(storedToken);
          await routeUser(cachedUser);
        }
      } catch {
        await clearSession(false);
      } finally {
        if (mounted) setBooting(false);
      }
    };

    restore();
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      try {
        if (await exchangeHandoffUrl(url)) return;
        if (captureFriendInvite(url)) await acceptPendingFriend();
      } catch (error) {
        Alert.alert('Could not open novo', error instanceof Error ? error.message : 'The sign-in link is no longer valid.');
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      const token = tokenRef.current;
      if (state !== 'active' || !token) return;
      try {
        const result = await restoreMobileSession(token);
        setAccountStatus(result.accountStatus ?? 'active');
        if (result.user) {
          if (screenRef.current === 'home') await saveUser(result.user);
          else await routeUser(result.user);
        }
      } catch {
        // Keep the cached profile visible during a temporary connection loss.
      }
    });
    return () => subscription.remove();
  }, []);

  const requireToken = () => {
    const token = tokenRef.current;
    if (!token) throw new Error('Please sign in again to continue.');
    return token;
  };

  const showMutationError = (error: unknown) => {
    Alert.alert('Could not sync', error instanceof Error ? error.message : 'Please check your connection and try again.');
  };

  const handleProfileCreated = (result: AuthResult) => handleAuth(result);

  const handleCheckAccess = async () => {
    const token = tokenRef.current;
    if (!token || checkingAccess) return;
    setCheckingAccess(true);
    try {
      const result = await restoreMobileSession(token);
      if (!result.user) throw new Error('Your profile could not be restored.');
      setAccountStatus(result.accountStatus ?? 'active');
      await routeUser(result.user);
    } catch (error) {
      if (!(error instanceof ApiError && error.accountStatus === 'suspended')) {
        Alert.alert('Could not check access', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setCheckingAccess(false);
    }
  };

  const handlePairRequest = async (tagToken: string, pickupLocation: string) => pairWristband(requireToken(), tagToken, pickupLocation);
  const handleLoadWristbandPickupLocations = useCallback((coordinates?: { latitude: number; longitude: number }) => getWristbandPickupLocations(requireToken(), coordinates), []);
  const handleReserveWristbandPickup = async (pickupLocation: string) => {
    const updated = await reserveWristbandPickup(requireToken(), pickupLocation);
    await saveUser(updated);
    return updated;
  };

  const handleWristbandInteraction = async (tagToken: string) => {
    const updated = await interactWithWristband(requireToken(), tagToken);
    await saveUser(updated);
    return updated;
  };

  const handlePaired = async (pairedUser: User) => {
    await routeUser(pairedUser);
  };

  const handleTutorialComplete = async (mascotName: string) => {
    const updated = await completeMemberOnboarding(requireToken(), mascotName);
    await saveUser(updated);
    await AsyncStorage.setItem(homeGuideKey(updated.id), 'pending');
    setShowHomeGuide(true);
    setScreen('home');
    return updated;
  };

  const handleHomeGuideComplete = async () => {
    if (user) await AsyncStorage.setItem(homeGuideKey(user.id), 'complete');
    setShowHomeGuide(false);
  };

  const handleEquip = async (accessoryId: AccessoryId) => {
    try {
      await saveUser(await equipAccessory(requireToken(), accessoryId));
    } catch (error) {
      showMutationError(error);
    }
  };

  const handlePurchase = async (accessoryId: AccessoryId, _cost: number) => {
    try {
      const updated = await purchaseAccessory(requireToken(), accessoryId);
      await saveUser(updated);
      if (updated.notificationPreferences.orders) {
        void sendLocalNotification('Accessory unlocked', 'Your new in-app accessory is ready in the wardrobe.', 'home').catch(() => undefined);
      }
    } catch (error) {
      showMutationError(error);
      throw error;
    }
  };

  const handleNotificationPreferences = async (preferences: User['notificationPreferences']) => {
    const notificationsAvailable = await syncNotificationSchedule(preferences);
    if (Object.values(preferences).some(Boolean) && !notificationsAvailable) throw new Error('Notifications are disabled for novo in your device settings.');
    await saveUser(await updateNotificationPreferences(requireToken(), preferences));
  };

  const handleUpdateProfile = async (input: { name: string; username: string; avatarDataUrl?: string | null }) => {
    const updated = await updateMemberProfile(requireToken(), input);
    await saveUser(updated);
    return updated;
  };

  const handleChangePassword = (input: { currentPassword: string; newPassword: string }) => changeMemberPassword(requireToken(), input);

  const handleLinkAccount = async (provider: OAuthProvider) => {
    const authorizationUrl = await startLinkedAccount(requireToken(), provider);
    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, 'novo://auth/oauth');
    if (result.type !== 'success') throw new Error('Account linking was cancelled.');
    const url = new URL(result.url);
    const oauthError = url.searchParams.get('oauthError');
    if (oauthError) throw new Error(oauthError);
    const nextToken = url.searchParams.get('token');
    if (!nextToken) throw new Error('The provider did not return a novo session.');
    await rememberSession(nextToken);
    const session = await restoreMobileSession(nextToken);
    if (!session.user) throw new Error('The updated profile could not be loaded.');
    await saveUser(session.user);
    return session.user;
  };

  const handleContribute = async (points: number, causeId: string, causeName: string) => {
    try {
      await saveUser(await contributePoints(requireToken(), points, causeId, causeName));
    } catch (error) {
      showMutationError(error);
      throw error;
    }
  };

  const handleRedeemCoupon = async (points: number, offerId: string, name: string) => {
    try {
      await saveUser(await redeemCoupon(requireToken(), points, offerId, name));
    } catch (error) {
      showMutationError(error);
      throw error;
    }
  };

  const handleUnpair = async () => {
    try {
      await routeUser(await unpairWristband(requireToken()));
    } catch (error) {
      showMutationError(error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      await deleteMemberAccount(requireToken());
      await AsyncStorage.multiRemove([SESSION_KEY, LAST_PROFILE_KEY, profileKey(user.email)]);
      tokenRef.current = null;
      setUser(null);
      setScreen('signin');
    } catch (error) {
      showMutationError(error);
    }
  };

  return (
    <SafeAreaProvider>
      <Animated.View pointerEvents={appReady ? 'auto' : 'none'} accessibilityElementsHidden={!appReady} importantForAccessibility={appReady ? 'auto' : 'no-hide-descendants'} style={[styles.appContent, { opacity: contentOpacity }]}>
        <StatusBar style="dark" />
        {accountStatus === 'limited' && screen !== 'signin' && screen !== 'onboarding' && <SafeAreaView edges={['top']} style={styles.limitedBanner}><Text style={styles.limitedTitle}>Limited account</Text><Text style={styles.limitedCopy}>Viewing is available. Changes that affect leaves, tasks, friends, purchases or wristbands are disabled.</Text></SafeAreaView>}
        {screen === 'signin' && <SignInScreen onAuthenticated={handleAuth} onSignUp={() => { setDraft(undefined); setScreen('onboarding'); }} />}
        {screen === 'onboarding' && <OnboardingScreen draft={draft} onBack={() => setScreen('signin')} onComplete={handleProfileCreated} />}
        {screen === 'pair-wristband' && user && <PairWristbandScreen user={user} loadPickupLocations={handleLoadWristbandPickupLocations} onPair={handlePairRequest} onReserve={handleReserveWristbandPickup} onPaired={handlePaired} onSignOut={clearSession} />}
        {screen === 'tutorial' && user && <TutorialScreen user={user} onComplete={handleTutorialComplete} />}
        {screen === 'home' && user && <HomeScreen demoMode={isShowcaseDemo()} user={user} token={requireToken()} showHomeGuide={showHomeGuide} onHomeGuideComplete={handleHomeGuideComplete} onUserUpdated={saveUser} onUpdateProfile={handleUpdateProfile} onChangePassword={handleChangePassword} onLinkAccount={handleLinkAccount} onWristbandTag={handleWristbandInteraction} onToggleAccessory={handleEquip} onPurchase={handlePurchase} onContribute={handleContribute} onRedeemCoupon={handleRedeemCoupon} onUpdateNotificationPreferences={handleNotificationPreferences} onUnpair={handleUnpair} onDeleteAccount={handleDeleteAccount} onSignOut={clearSession} />}
        {screen === 'account-status' && <SafeAreaView style={styles.statusScreen}><View style={styles.statusCard}><View style={styles.statusIcon}><Text style={styles.statusIconText}>!</Text></View><Text style={styles.statusEyebrow}>ACCOUNT SUSPENDED</Text><Text style={styles.statusTitle}>Access to novo is paused</Text><Text style={styles.statusCopy}>An administrator has suspended this account. Your profile and progress are still saved. Ask an administrator to set the account back to Active, then check again here.</Text><Pressable style={styles.primaryButton} disabled={checkingAccess} onPress={() => void handleCheckAccess()}><Text style={styles.primaryButtonText}>{checkingAccess ? 'Checking…' : 'Check access again'}</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => void clearSession()}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable></View></SafeAreaView>}
      </Animated.View>
      {startupVisible && <StartupScreen introComplete={introComplete} message={bootMessage} ready={appReady} onIntroComplete={handleIntroComplete} onExitComplete={() => setStartupVisible(false)} />}
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <NovoApp />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  appContent: { flex: 1 },
  startupScreen: { ...StyleSheet.absoluteFillObject, zIndex: 1000, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17352A', overflow: 'hidden' },
  startupStage: { width: 240, height: 96, alignItems: 'center', justifyContent: 'center' },
  startupLockup: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startupMark: { zIndex: 3, width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  startupLeaf: { width: 35, height: 45, borderTopLeftRadius: 31, borderTopRightRadius: 7, borderBottomLeftRadius: 8, borderBottomRightRadius: 31, backgroundColor: '#DFFC76', transform: [{ rotate: '11deg' }], overflow: 'hidden' },
  startupLeafVein: { position: 'absolute', width: 2, height: 35, left: 17, top: 11, borderRadius: 2, backgroundColor: 'rgba(23,53,42,0.32)', transform: [{ rotate: '-40deg' }] },
  startupWordReveal: { height: 54, overflow: 'hidden', justifyContent: 'center' },
  startupWord: { width: 112, paddingLeft: 10, color: '#FFFFFF', fontFamily: 'GoogleSansFlex', fontSize: 39, lineHeight: 48, fontWeight: '800', letterSpacing: -1.6 },
  startupLoader: { position: 'absolute', bottom: '19%', minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 7 },
  startupLoaderPlaceholder: { position: 'absolute', bottom: '19%', height: 72 },
  startupMessage: { color: '#FFFFFF', fontFamily: 'GoogleSansFlex', fontSize: 14, fontWeight: '700' },
  startupHint: { color: 'rgba(255,255,255,0.58)', fontFamily: 'GoogleSansFlex', fontSize: 11 },
  limitedBanner: { paddingHorizontal: 18, paddingBottom: 12, backgroundColor: '#FFF2C7', borderBottomWidth: 1, borderBottomColor: '#E2C66F' },
  limitedTitle: { color: '#5D4300', fontFamily: 'GoogleSansFlex', fontSize: 15, fontWeight: '700' },
  limitedCopy: { marginTop: 2, color: '#725A18', fontFamily: 'GoogleSansFlex', fontSize: 12, lineHeight: 16 },
  statusScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.cream },
  statusCard: { width: '100%', maxWidth: 440, padding: 28, borderRadius: 32, backgroundColor: '#FFFFFF', shadowColor: '#17352A', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  statusIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFE1DE' },
  statusIconText: { color: '#A9342B', fontFamily: 'GoogleSansFlex', fontSize: 30, fontWeight: '800' },
  statusEyebrow: { marginTop: 22, color: '#A9342B', fontFamily: 'GoogleSansFlex', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  statusTitle: { marginTop: 8, color: colors.forest, fontFamily: 'GoogleSansFlex', fontSize: 28, fontWeight: '700' },
  statusCopy: { marginTop: 12, marginBottom: 24, color: '#5E6F67', fontFamily: 'GoogleSansFlex', fontSize: 15, lineHeight: 22 },
  primaryButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.forest },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'GoogleSansFlex', fontSize: 16, fontWeight: '700' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryButtonText: { color: colors.forest, fontFamily: 'GoogleSansFlex', fontSize: 15, fontWeight: '700' },
});
