import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ApiError,
  addFriend,
  contributePoints,
  deleteMemberAccount,
  equipAccessory,
  exchangeMobileHandoff,
  getMemberProfile,
  interactWithWristband,
  pairWristband,
  purchaseAccessory,
  reserveWristbandPickup,
  redeemCoupon,
  getWristbandPickupLocations,
  revokeSession,
  restoreMobileSession,
  updateNotificationPreferences,
  unpairWristband,
} from './src/api';
import { sendLocalNotification, syncNotificationSchedule } from './src/notifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PairWristbandScreen } from './src/screens/PairWristbandScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { AccessoryId, AuthResult, Screen, User } from './src/types';
import { colors } from './src/theme';

const SESSION_KEY = 'novo-mobile-session';
const LAST_PROFILE_KEY = 'novo-last-profile';
const profileKey = (email: string) => `novo-profile:${email.toLowerCase()}`;

export default function App() {
  const [fontsLoaded] = useFonts({ GoogleSansFlex: require('./assets/fonts/GoogleSansFlex-Regular.ttf') });
  const [screen, setScreen] = useState<Screen>('signin');
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<{ name: string; email: string }>();
  const [booting, setBooting] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const pendingFriendRef = useRef<string | null>(null);

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
    setScreen(nextUser.wristbandPaired ? 'home' : 'pair-wristband');
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
    setScreen('signin');
  };

  const handleAuth = async (result: AuthResult) => {
    if (result.isNewUser) {
      setDraft(result.draft);
      setScreen('onboarding');
      return;
    }

    if (!result.user || !result.token) throw new Error('The server did not return a complete novo session.');
    await rememberSession(result.token);
    await routeUser(result.user);
  };

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
        const initialUrl = await Linking.getInitialURL();
        if (await exchangeHandoffUrl(initialUrl)) return;
        captureFriendInvite(initialUrl);

        const storedToken = await AsyncStorage.getItem(SESSION_KEY);
        if (!storedToken) return;
        try {
          const result = await restoreMobileSession(storedToken);
          if (!result.user) throw new Error('Profile missing from session.');
          await rememberSession(storedToken);
          await routeUser(result.user);
          await acceptPendingFriend();
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
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
        await saveUser(await getMemberProfile(token));
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
    await saveUser(pairedUser);
    setScreen('home');
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
      if (updated.notificationPreferences.orders) void sendLocalNotification('Accessory unlocked', 'Your new in-app accessory is ready in the wardrobe.', 'home');
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

  if (!fontsLoaded || booting) {
    return <View style={styles.loading}><ActivityIndicator color={colors.forest} size="large" /></View>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {screen === 'signin' && <SignInScreen onAuthenticated={handleAuth} onSignUp={() => setScreen('onboarding')} />}
      {screen === 'onboarding' && <OnboardingScreen draft={draft} onBack={() => setScreen('signin')} onComplete={handleProfileCreated} />}
      {screen === 'pair-wristband' && user && <PairWristbandScreen user={user} loadPickupLocations={handleLoadWristbandPickupLocations} onPair={handlePairRequest} onReserve={handleReserveWristbandPickup} onPaired={handlePaired} onSignOut={clearSession} />}
      {screen === 'home' && user && <HomeScreen user={user} token={requireToken()} onUserUpdated={saveUser} onWristbandTag={handleWristbandInteraction} onToggleAccessory={handleEquip} onPurchase={handlePurchase} onContribute={handleContribute} onRedeemCoupon={handleRedeemCoupon} onUpdateNotificationPreferences={handleNotificationPreferences} onUnpair={handleUnpair} onDeleteAccount={handleDeleteAccount} onSignOut={clearSession} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});
