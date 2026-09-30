import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, DimensionValue, Easing, Image, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Defs, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GridBackground } from '../components/GridBackground';
import { AccessoryPreview3D } from '../components/AccessoryPreview3D';
import { Logo } from '../components/Logo';
import { PlushieScene } from '../components/PlushieScene';
import { TasksMap } from '../components/TasksMap';
import { Text } from '../components/Typography';
import { ACCESSORIES } from '../data/accessories';
import { ACCESSORY_COLOR_SEEDS, AccessoryColorScheme, createAccessoryColorScheme } from '../dynamicTheme';
import { colors } from '../theme';
import { AccessoryCategory, AccessoryId, AccessoryRarity, Friend, ImpactSummary, MarketItem, MascotType, NovoEvent, NovoLocation, OAuthProvider, TaskSubmission, User, WeeklyCompetition } from '../types';
import { cancelEventSignup, completeWeeklyCompetition, createFriendInviteUrl, getFriends, getLocations, getMemberImpact, getMemberMarket, getMemberTasks, signUpForEvent, startWeeklyCompetition, submitCustomTask, submitDailyQuiz, submitDailyTask } from '../api';
import { startNovoWristbandListener } from '../nfc';
import { ProfileSettingsPage } from './ProfileSettingsPage';

type Tab = 'home' | 'marketplace' | 'tasks' | 'friends' | 'settings';
type AccessoryFilter = 'all' | AccessoryCategory;
type Palette = AccessoryColorScheme;
type Props = {
  user: User;
  token: string;
  onSignOut: () => void;
  onUnpair: () => void;
  onDeleteAccount: () => void;
  onWristbandTag: (tagToken: string) => Promise<User>;
  onToggleAccessory: (id: AccessoryId) => void;
  onPurchase: (id: AccessoryId, cost: number) => Promise<void>;
  onContribute: (points: number, causeId: string, causeName: string) => Promise<void>;
  onRedeemCoupon: (points: number, offerId: string, name: string) => Promise<void>;
  onUpdateNotificationPreferences: (preferences: User['notificationPreferences']) => Promise<void>;
  onUserUpdated: (user: User) => Promise<void>;
  onUpdateProfile: (input: { name: string; username: string; avatarDataUrl?: string | null }) => Promise<User>;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  onLinkAccount: (provider: OAuthProvider) => Promise<User>;
};

type AccessoryOffer = { id: AccessoryId; price: number; description: string; imageDataUrl?: string | null };
type PurposeOffer = { id: string; name: string; type: 'coupon' | 'charity'; detail: string; description: string; icon: keyof typeof Ionicons.glyphMap; points: number; imageDataUrl?: string | null };
type MarketSelection = { kind: 'accessory'; offer: AccessoryOffer } | { kind: 'purpose'; purpose: PurposeOffer };

const defaultPalette = createAccessoryColorScheme([]);
const useNativeAnimationDriver = Platform.OS !== 'web';
const DynamicSchemeContext = createContext<Palette>(defaultPalette);
const useDynamicScheme = () => useContext(DynamicSchemeContext);

const categoryFilters: { id: AccessoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hats', label: 'Hats' },
  { id: 'scarves', label: 'Scarves' },
  { id: 'mitts', label: 'Hand mitts' },
  { id: 'socks', label: 'Socks' },
  { id: 'bracelets', label: 'Bracelets' },
  { id: 'badges', label: 'Badges' },
];

const rarityRank: Record<AccessoryRarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const rarityColors: Record<AccessoryRarity, { background: string; text: string }> = {
  common: { background: '#EDF0EC', text: '#52605A' },
  uncommon: { background: '#E1F4DF', text: '#356437' },
  rare: { background: '#DFEEFF', text: '#28598B' },
  epic: { background: '#EEE5FF', text: '#65419B' },
  legendary: { background: '#FFF0CB', text: '#7B4C09' },
};

const OPEN_SOURCE_CREDITS = [
  { name: 'OpenStreetMap', detail: 'Map data © OpenStreetMap contributors', license: 'Open Data Commons Open Database License', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'OpenFreeMap', detail: 'Map styles and tile delivery', license: 'Open map service', url: 'https://openfreemap.org/' },
  { name: 'MapLibre GL JS', detail: 'Interactive map rendering', license: 'BSD 3-Clause', url: 'https://github.com/maplibre/maplibre-gl-js' },
  { name: 'React Native & React', detail: 'Application interface and runtime', license: 'MIT License', url: 'https://github.com/facebook/react-native' },
  { name: 'Expo', detail: 'Cross-platform application tooling and modules', license: 'MIT License', url: 'https://github.com/expo/expo' },
  { name: 'Three.js & React Three Fiber', detail: '3D mascot and accessory rendering', license: 'MIT License', url: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'Ionicons', detail: 'Interface iconography', license: 'MIT License', url: 'https://github.com/ionic-team/ionicons' },
  { name: 'react-native-nfc-manager', detail: 'NFC wristband pairing and interaction', license: 'MIT License', url: 'https://github.com/revtel/react-native-nfc-manager' },
  { name: 'react-native-qrcode-svg', detail: 'Friend invitation QR codes', license: 'MIT License', url: 'https://github.com/Expensify/react-native-qrcode-svg' },
  { name: 'React Native WebView', detail: 'Native map presentation', license: 'MIT License', url: 'https://github.com/react-native-webview/react-native-webview' },
  { name: 'Express, SQLite & Zod', detail: 'API, persistent storage and validation', license: 'Open-source software', url: 'https://github.com/expressjs/express' },
] as const;

export function HomeScreen(props: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [nfcStatus, setNfcStatus] = useState<'starting' | 'ready' | 'reading' | 'error' | 'web'>('starting');
  const [nfcMessage, setNfcMessage] = useState('');
  const [celebrationKey, setCelebrationKey] = useState(0);
  const interactionRef = useRef(props.onWristbandTag);
  const interactionBusyRef = useRef(false);
  const palette = useMemo(() => createAccessoryColorScheme(props.user.equippedAccessories), [props.user.equippedAccessories]);

  useEffect(() => { interactionRef.current = props.onWristbandTag; }, [props.onWristbandTag]);
  useEffect(() => {
    if (tab !== 'home') return undefined;
    if (Platform.OS === 'web') {
      setNfcStatus('web');
      setNfcMessage('Use the installed novo app to tap your wristband with NFC.');
      return undefined;
    }
    let disposed = false;
    let stopListening: (() => Promise<void>) | undefined;
    setNfcStatus('starting');
    setNfcMessage('');
    startNovoWristbandListener((tagToken) => {
      if (disposed || interactionBusyRef.current) return;
      interactionBusyRef.current = true;
      setNfcStatus('reading');
      void interactionRef.current(tagToken).then(() => {
        if (disposed) return;
        setNfcStatus('ready');
        setNfcMessage('');
        setCelebrationKey((current) => current + 1);
      }).catch((reason) => {
        if (disposed) return;
        setNfcStatus('error');
        setNfcMessage(reason instanceof Error ? reason.message : 'That is not the wristband paired to this account.');
      }).finally(() => { interactionBusyRef.current = false; });
    }, () => {
      if (!disposed) {
        setNfcStatus('error');
        setNfcMessage('That NFC tag is not a prepared novo wristband.');
      }
    }).then((stop) => {
      if (disposed) void stop();
      else {
        stopListening = stop;
        setNfcStatus('ready');
      }
    }).catch((reason) => {
      if (disposed) return;
      setNfcStatus('error');
      setNfcMessage(reason instanceof Error ? reason.message : 'NFC is unavailable right now.');
    });
    return () => {
      disposed = true;
      interactionBusyRef.current = false;
      if (stopListening) void stopListening();
    };
  }, [tab]);
  useEffect(() => {
    if (!celebrationKey) return undefined;
    const timeout = setTimeout(() => setCelebrationKey(0), 1350);
    return () => clearTimeout(timeout);
  }, [celebrationKey]);
  const changeTab = (next: Tab) => {
    if (next !== 'home') setCelebrationKey(0);
    setTab(next);
  };

  return (
    <DynamicSchemeContext.Provider value={palette}>
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LinearGradient colors={[palette.background, palette.surfaceContainerLow, blendWithWhite(palette.secondaryContainer, 0.4)]} locations={[0, 0.57, 1]} style={[styles.shell, Platform.OS === 'web' && ({ overflow: 'clip' } as never)]}>
        <GridBackground color={palette.outlineVariant} opacity={0.32} />
        {tab !== 'tasks' && <AppHeader />}
        <View style={styles.body}>
          {tab === 'home' && <HomePage user={props.user} palette={palette} nfcStatus={nfcStatus} nfcMessage={nfcMessage} celebrationKey={celebrationKey} onToggleAccessory={props.onToggleAccessory} onOpenTasks={() => changeTab('tasks')} />}
          {tab === 'marketplace' && <MarketplacePage user={props.user} token={props.token} palette={palette} onPurchase={props.onPurchase} onContribute={props.onContribute} onRedeemCoupon={props.onRedeemCoupon} />}
          {tab === 'tasks' && <TasksPage token={props.token} palette={palette} onUserUpdated={props.onUserUpdated} />}
          {tab === 'friends' && <FriendsPage user={props.user} token={props.token} palette={palette} />}
          {tab === 'settings' && <SettingsPage user={props.user} palette={palette} onUpdateProfile={props.onUpdateProfile} onChangePassword={props.onChangePassword} onLinkAccount={props.onLinkAccount} onUpdateNotifications={props.onUpdateNotificationPreferences} onSignOut={props.onSignOut} onUnpair={props.onUnpair} onDeleteAccount={props.onDeleteAccount} />}
        </View>
        <GlassNav active={tab} palette={palette} onChange={changeTab} />
      </LinearGradient>
    </SafeAreaView>
    </DynamicSchemeContext.Provider>
  );
}

function useReduceMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function AppHeader() {
  return (
    <View style={styles.header}>
      <Logo compact />
    </View>
  );
}

function HomePage({ user, palette, nfcStatus, nfcMessage, celebrationKey, onToggleAccessory, onOpenTasks }: { user: User; palette: Palette; nfcStatus: 'starting' | 'ready' | 'reading' | 'error' | 'web'; nfcMessage: string; celebrationKey: number; onToggleAccessory: (id: AccessoryId) => void; onOpenTasks: () => void }) {
  const [showCloset, setShowCloset] = useState(false);
  const [accessoryFilter, setAccessoryFilter] = useState<AccessoryFilter>('all');
  const { height, width } = useWindowDimensions();
  const compactHome = height < 760 || width < 350;
  const reduceMotion = useReduceMotionPreference();
  const level = useMemo(() => getLifetimeLevel(user.lifetimePoints), [user.lifetimePoints]);
  const availableCategoryFilters = useMemo(
    () => categoryFilters.filter((filter) => filter.id === 'all' || user.accessories.some((id) => ACCESSORIES.find((item) => item.id === id)?.category === filter.id)),
    [user.accessories],
  );
  const visibleAccessories = useMemo(
    () => ACCESSORIES
      .filter((item) => user.accessories.includes(item.id) && (accessoryFilter === 'all' || item.category === accessoryFilter))
      .sort((left, right) => rarityRank[right.rarity] - rarityRank[left.rarity] || left.name.localeCompare(right.name)),
    [accessoryFilter, user.accessories],
  );
  useEffect(() => {
    if (!availableCategoryFilters.some((filter) => filter.id === accessoryFilter)) setAccessoryFilter('all');
  }, [accessoryFilter, availableCategoryFilters]);
  const progressPercent = Math.round(level.progress * 100);
  const progressWidth = `${progressPercent === 0 ? 0 : Math.max(3, progressPercent)}%` as DimensionValue;
  const leavesToNextLevel = Math.max(0, level.required - level.current);
  const dailyGreetingDue = !scannedToday(user.lastWristbandTapAt);
  const firstGreeting = !user.lastWristbandTapAt;
  const completedQuestCount = user.dailyQuests.filter((quest) => quest.completed).length;
  const questCount = user.dailyQuests.length;
  const dailyInteractionCopy = nfcStatus === 'reading' ? `Checking in with ${user.mascotName}…` : nfcStatus === 'starting' ? 'Getting NFC ready…' : nfcStatus === 'ready' ? 'NFC is ready—tap your novo wristband to refresh today’s quests.' : nfcMessage;

  return (
    <View style={[styles.homePage, compactHome && { paddingHorizontal: 18 }, showCloset && { paddingBottom: 92 }]}>
      <View style={[styles.homeGlowBackdrop, { pointerEvents: 'none' }]}><AccessoryGlow accessories={user.equippedAccessories} /></View>
      {celebrationKey > 0 && <View key={celebrationKey} style={[styles.homeCelebration, { pointerEvents: 'none' }]}><ConfettiBurst colors={[palette.primary, palette.secondary, '#FF8178', '#55C4D8']} /><View style={[styles.celebrationMessage, { backgroundColor: palette.deep }]}><Text style={styles.celebrationMessageText}>Streak +1! New quests ready</Text></View></View>}
      <View style={styles.homeOverview}>
        <View style={styles.greetingBlock}><Text style={styles.hello}>Hi, {user.name.split(' ')[0]}</Text><Text style={styles.helloSub}>Small choices, big change.</Text></View>
        <View style={styles.homeStats}>
          <View accessible accessibilityLabel={`${user.streak} day wristband streak${dailyGreetingDue ? '. Tap your wristband today to continue it.' : '. Today is complete.'}`} style={[styles.streakPill, { backgroundColor: withAlpha(palette.surfaceBright, 0.9), borderColor: palette.outlineVariant }]}><Ionicons name={dailyGreetingDue ? 'flame-outline' : 'flame'} size={17} color={dailyGreetingDue ? '#B84C27' : '#E7662F'} /><Text style={[styles.statNumber, { color: palette.onSurface }]}>{user.streak}</Text></View>
          <View accessible accessibilityLabel={`${user.points} spendable leaves`} style={[styles.pointsPill, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={15} color={palette.onPrimary} /><Text style={[styles.statNumber, { color: palette.onPrimary }]}>{user.points}</Text></View>
        </View>
      </View>

      <View accessible accessibilityLabel={`${user.lifetimePoints.toLocaleString()} lifetime leaves. Level ${level.level}. ${level.current.toLocaleString()} of ${level.required.toLocaleString()} leaves toward level ${level.level + 1}.`} style={[styles.lifetimeCard, { backgroundColor: withAlpha(palette.surfaceBright, 0.91), borderColor: palette.outlineVariant }]}>
        <View style={styles.lifetimeTop}>
          <View style={styles.lifetimeLabel}><View style={[styles.lifetimeIcon, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={13} color={palette.onPrimary} /></View><View><Text style={[styles.lifetimeTitle, { color: palette.onSurfaceVariant }]}>Lifetime leaves</Text><Text style={[styles.lifetimeTotal, { color: palette.onSurface }]}>{user.lifetimePoints.toLocaleString()}</Text></View></View>
          <View style={[styles.levelPill, { backgroundColor: palette.primaryContainer }]}><Text style={[styles.levelText, { color: palette.onPrimaryContainer }]}>Level {level.level}</Text></View>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: level.required, now: level.current, text: `${Math.round(level.progress * 100)} percent to level ${level.level + 1}` }} style={[styles.levelTrack, { backgroundColor: palette.surfaceContainerHigh }]}><View style={[styles.levelFill, { width: progressWidth, backgroundColor: palette.primary }]} /></View>
        <View style={styles.levelFooter}><Text style={[styles.levelProgress, { color: palette.onSurface }]}>{progressPercent}% complete</Text><Text style={[styles.levelNext, { color: palette.onSurfaceVariant }]}>{leavesToNextLevel.toLocaleString()} to level {level.level + 1}</Text></View>
      </View>

      <View accessibilityLabel={`${(user.impact?.divertedKg ?? 0).toFixed(2)} kilograms kept in use or diverted`} style={[styles.personalImpactStrip, { backgroundColor: palette.secondaryContainer, borderColor: palette.outlineVariant }]}><View style={[styles.personalImpactIcon, { backgroundColor: palette.surfaceBright }]}><Ionicons name="scale-outline" size={17} color={palette.deep} /></View><View style={{ flex: 1 }}><Text style={[styles.personalImpactLabel, { color: palette.onSecondaryContainer }]}>YOUR VERIFIED IMPACT</Text><Text style={[styles.personalImpactValue, { color: palette.onSurface }]}>{(user.impact?.divertedKg ?? 0).toFixed(2)} kg diverted · {user.impact?.approvedActions ?? 0} actions</Text></View></View>

      <View style={[
        styles.sceneArea,
        dailyGreetingDue && !showCloset && { minHeight: compactHome ? 116 : 142, marginTop: 2, marginBottom: 0 },
        showCloset && { minHeight: compactHome ? 146 : 180, marginTop: 2, marginBottom: 0 },
        !dailyGreetingDue && !showCloset && compactHome && { minHeight: 184 },
      ]}>
        <InteractiveMascot name={user.mascotName} mascotType={user.mascotType} accessories={user.equippedAccessories} palette={palette} autoRotate={!reduceMotion && celebrationKey === 0} compact={showCloset} />
      </View>

      <View style={[
        styles.homeBottom,
        showCloset && { position: 'absolute', left: compactHome ? 18 : 24, right: compactHome ? 18 : 24, bottom: 96, width: undefined, paddingTop: 0 },
      ]}>
        <View style={[styles.plushieIdentity, showCloset && { paddingTop: 0, paddingBottom: 7 }]}>
          <Text style={styles.plushieName}>{user.mascotName}</Text>
          <Text style={styles.plushieType}>{mascotLabel(user.mascotType)} · {user.wristbandColor.replace('-', ' ')}</Text>
        </View>

        {!showCloset && dailyGreetingDue && (
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`NFC is listening for the wristband paired to ${user.mascotName}. ${dailyInteractionCopy}`}
            style={[styles.dailyTap, { minHeight: 78, backgroundColor: palette.primaryContainer, borderColor: palette.outlineVariant }]}
          >
            <View style={[styles.dailyTapIcon, { backgroundColor: 'rgba(255,255,255,0.86)' }]}>
              <Ionicons name={nfcStatus === 'reading' ? 'sparkles' : 'radio-outline'} size={18} color={palette.deep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dailyTapEyebrow, { fontSize: 10, lineHeight: 13 }]}>{firstGreeting ? 'FIRST GREETING' : 'DAILY GREETING'}</Text>
              <Text style={[styles.dailyTapTitle, { fontSize: 14, lineHeight: 18 }]}>{firstGreeting ? `Tap your wristband to meet ${user.mascotName}` : `Refresh quests with your wristband`}</Text>
              <Text style={[styles.dailyTapText, { color: palette.onPrimaryContainer, fontSize: 12, lineHeight: 16, fontWeight: '500' }]}>{dailyInteractionCopy || 'Tap the wristband once today to refresh random quests and continue your streak.'}</Text>
            </View>
            {nfcStatus === 'ready' && <View style={styles.nfcReadyDot} />}
          </View>
        )}

        {showCloset ? (
          <GlassPanel style={[styles.closet, { height: compactHome ? 194 : 210 }]}>
          <View style={[styles.closetTop, compactHome && { minHeight: 38 }]}><View><Text style={[styles.closetTitle, { color: palette.onSurface }]}>Wardrobe</Text><Text style={[styles.closetHint, { color: palette.onSurfaceVariant }]}>{user.equippedAccessories.length} equipped · tap an item to change</Text></View><Pressable onPress={() => setShowCloset(false)} accessibilityRole="button" accessibilityLabel="Close wardrobe" style={[styles.miniClose, { backgroundColor: withAlpha(palette.surfaceBright, 0.72) }]}><Ionicons name="close" size={18} color={palette.onSurface} /></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroller} contentContainerStyle={styles.categoryList}>
            {availableCategoryFilters.map((category) => {
              const active = accessoryFilter === category.id;
              return <Pressable key={category.id} onPress={() => setAccessoryFilter(category.id)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.categoryChip, { minHeight: 34, backgroundColor: active ? palette.deep : palette.surfaceContainer }]}><Text style={[styles.categoryChipText, { color: active ? '#FFFFFF' : palette.onSurfaceVariant }]}>{category.label}</Text></Pressable>;
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accessoryScroller} contentContainerStyle={styles.accessoryList}>
            {visibleAccessories.map((item) => {
              const equipped = user.equippedAccessories.includes(item.id);
              const rarity = rarityColors[item.rarity];
              const itemScheme = createAccessoryColorScheme([item.id]);
              return (
                <Pressable key={item.id} onPress={() => onToggleAccessory(item.id)} accessibilityRole="switch" accessibilityLabel={`${item.name}, ${categoryLabel(item.category)}, ${item.rarity}`} accessibilityHint={equipped ? 'Removes this accessory from your mascot' : 'Equips this accessory on your mascot'} accessibilityState={{ checked: equipped }} style={({ pressed }) => [styles.accessoryCard, { height: compactHome ? 82 : 92, backgroundColor: itemScheme.primaryContainer, borderColor: equipped ? itemScheme.deep : itemScheme.outlineVariant }, equipped && styles.accessoryChipActive, pressed && styles.cardPressed]}>
                  <View style={styles.accessoryCardTop}><View style={[styles.accessoryIconBubble, { backgroundColor: withAlpha(itemScheme.surfaceBright, 0.72) }]}><Ionicons name={accessoryIcon(item.id)} size={19} color={itemScheme.onPrimaryContainer} /></View><Ionicons name={equipped ? 'checkmark-circle' : 'add-circle-outline'} size={17} color={itemScheme.deep} /></View>
                  <Text style={[styles.accessoryChipText, { color: itemScheme.onPrimaryContainer }]} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.accessoryMeta}><Text style={[styles.accessoryCategory, { color: itemScheme.onPrimaryContainer }]}>{categoryLabel(item.category)}</Text><View style={[styles.rarityPill, { backgroundColor: rarity.background }]}><Text style={[styles.rarityText, { color: rarity.text }]}>{item.rarity}</Text></View></View>
                </Pressable>
              );
            })}
            {!visibleAccessories.length && <View style={{ width: 210, minHeight: 82, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 5 }}><Ionicons name="shirt-outline" size={20} color={palette.onSurfaceVariant} /><Text style={{ color: palette.onSurfaceVariant, fontSize: 11, lineHeight: 15, textAlign: 'center' }}>No accessories in this category yet.</Text></View>}
          </ScrollView>
          </GlassPanel>
        ) : (
          <View style={styles.homeActions}>
            <Pressable onPress={() => setShowCloset(true)} accessibilityRole="button" accessibilityLabel={`Open wardrobe. ${user.equippedAccessories.length} accessories equipped.`} accessibilityHint="Choose which digital accessories your mascot wears" style={({ pressed }) => [styles.homeActionPrimary, { backgroundColor: palette.deep }, pressed && styles.cardPressed]}><Ionicons name="shirt-outline" size={20} color="#FFFFFF" /><Text style={styles.homeActionPrimaryText}>Wardrobe</Text><View style={[styles.stackBadge, { backgroundColor: palette.tertiaryContainer }]}><Text style={[styles.stackBadgeText, { color: palette.onTertiaryContainer }]}>{user.equippedAccessories.length}</Text></View></Pressable>
            {!dailyGreetingDue && <Pressable onPress={onOpenTasks} accessibilityRole="button" accessibilityLabel={`${completedQuestCount} of ${questCount} daily quests complete. Open Tasks.`} style={({ pressed }) => [styles.homeActionSecondary, { flex: 0.82, minWidth: 124, borderWidth: 1, backgroundColor: withAlpha(palette.surfaceBright, 0.84), borderColor: palette.outlineVariant }, pressed && styles.cardPressed]}><Ionicons name={questCount > 0 && completedQuestCount === questCount ? 'checkmark-circle' : 'sparkles-outline'} size={19} color={palette.deep} /><View><Text style={[styles.homeActionSecondaryText, { color: palette.onSurface, fontSize: 14, lineHeight: 17 }]}>Today</Text><Text style={{ color: palette.onSurfaceVariant, fontSize: 10, lineHeight: 13, fontWeight: '600' }}>{questCount ? `${completedQuestCount} / ${questCount} quests` : 'Explore tasks'}</Text></View></Pressable>}
          </View>
        )}
      </View>
    </View>
  );
}

function InteractiveMascot({ name, mascotType, accessories, palette, autoRotate, compact }: { name: string; mascotType: MascotType; accessories: AccessoryId[]; palette: Palette; autoRotate: boolean; compact: boolean }) {
  const [manualRotation, setManualRotation] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const manualRotationRef = useRef({ x: 0, y: 0 });
  const rotationStartRef = useRef({ x: 0, y: 0 });
  const lastRotationUpdateRef = useRef(0);
  const recenterFrameRef = useRef<number | null>(null);
  const stopRecentering = useCallback(() => {
    if (recenterFrameRef.current !== null) cancelAnimationFrame(recenterFrameRef.current);
    recenterFrameRef.current = null;
  }, []);
  const recenterVerticalRotation = useCallback(() => {
    stopRecentering();
    const initialY = manualRotationRef.current.y;
    if (Math.abs(initialY) < 0.001) {
      manualRotationRef.current = { ...manualRotationRef.current, y: 0 };
      setManualRotation(manualRotationRef.current);
      return;
    }
    const startedAt = Date.now();
    const duration = 360;
    const update = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const nextRotation = { ...manualRotationRef.current, y: initialY * (1 - eased) };
      manualRotationRef.current = nextRotation;
      setManualRotation(nextRotation);
      if (progress < 1) recenterFrameRef.current = requestAnimationFrame(update);
      else {
        manualRotationRef.current = { ...manualRotationRef.current, y: 0 };
        setManualRotation(manualRotationRef.current);
        recenterFrameRef.current = null;
      }
    };
    recenterFrameRef.current = requestAnimationFrame(update);
  }, [stopRecentering]);
  useEffect(() => stopRecentering, [stopRecentering]);
  const rotationPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.hypot(gesture.dx, gesture.dy) > 2,
    onPanResponderGrant: () => {
      stopRecentering();
      rotationStartRef.current = { ...manualRotationRef.current };
      setIsInteracting(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const nextRotation = {
        x: rotationStartRef.current.x + gesture.dx * 0.012,
        y: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationStartRef.current.y + gesture.dy * 0.012)),
      };
      manualRotationRef.current = nextRotation;
      const now = Date.now();
      if (now - lastRotationUpdateRef.current >= 24) {
        lastRotationUpdateRef.current = now;
        setManualRotation(nextRotation);
      }
    },
    onPanResponderRelease: () => {
      setManualRotation(manualRotationRef.current);
      setIsInteracting(false);
      recenterVerticalRotation();
    },
    onPanResponderTerminate: () => {
      setManualRotation(manualRotationRef.current);
      setIsInteracting(false);
      recenterVerticalRotation();
    },
  }), [recenterVerticalRotation, stopRecentering]);

  return <>
    <View {...rotationPan.panHandlers} style={StyleSheet.absoluteFill} accessible accessibilityRole="adjustable" accessibilityLabel={`${name}, interactive 3D ${mascotLabel(mascotType)}`} accessibilityHint="Drag left or right to turn in either direction. Drag up or down to tilt up to 90 degrees. Vertical tilt recentres and horizontal rotation resumes when released.">
      <PlushieScene mascotType={mascotType} accessories={accessories} manualRotationX={manualRotation.x} manualRotationY={manualRotation.y} isInteracting={isInteracting} autoRotate={autoRotate} compact={compact} />
    </View>
    <View style={[styles.rotationHint, { backgroundColor: withAlpha(palette.surfaceBright, 0.94), borderWidth: 1, borderColor: palette.outlineVariant }]}><Ionicons name={isInteracting ? 'hand-left' : 'move-outline'} size={12} color={palette.onSurfaceVariant} /><Text style={[styles.rotationText, { color: palette.onSurfaceVariant, fontSize: 12, fontWeight: '700' }]}>{isInteracting ? 'Rotating' : 'Drag to rotate'}</Text></View>
  </>;
}

function mascotLabel(type: MascotType) {
  return ({ 'polar-bear': 'Polar Bear', penguin: 'Penguin', fox: 'Fox', turtle: 'Turtle', bird: 'Bird' })[type];
}

function getLifetimeLevel(lifetimePoints: number) {
  const growth = 1.6;
  const baseRequirement = 400;
  let level = 1;
  let current = Math.max(0, lifetimePoints);
  let required = baseRequirement;

  while (current >= required && level < 50) {
    current -= required;
    level += 1;
    required = Math.round(baseRequirement * growth ** (level - 1));
  }

  return { level, current, required, progress: Math.min(1, current / required) };
}

function singaporeDay(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function scannedToday(lastScan: string | null) {
  return Boolean(lastScan && singaporeDay(lastScan) === singaporeDay(new Date()));
}

function AccessoryGlow({ accessories }: { accessories: AccessoryId[] }) {
  const positions = [{ x: 200, y: 202 }, { x: 125, y: 235 }, { x: 285, y: 145 }, { x: 225, y: 285 }];
  const shown = accessories.length ? accessories.slice(0, 4) : ['bright-star' as AccessoryId];
  return <View style={[styles.glowCanvas, { pointerEvents: 'none' }]}><Svg width="146%" height="146%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet"><Defs>{shown.map((id, index) => <SvgRadialGradient key={id} id={`novo-glow-${index}`} cx="50%" cy="50%" rx="50%" ry="50%"><Stop offset="0%" stopColor={ACCESSORY_COLOR_SEEDS[id]} stopOpacity="0.26"/><Stop offset="42%" stopColor={ACCESSORY_COLOR_SEEDS[id]} stopOpacity="0.095"/><Stop offset="76%" stopColor={ACCESSORY_COLOR_SEEDS[id]} stopOpacity="0.018"/><Stop offset="100%" stopColor={ACCESSORY_COLOR_SEEDS[id]} stopOpacity="0"/></SvgRadialGradient>)}</Defs>{shown.map((id, index) => <Circle key={id} cx={positions[index]?.x ?? 200} cy={positions[index]?.y ?? 200} r={index ? 190 : 224} fill={`url(#novo-glow-${index})`}/>)}</Svg></View>;
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function blendWithWhite(hex: string, whiteRatio: number) {
  const value = hex.replace('#', '');
  const ratio = Math.max(0, Math.min(1, whiteRatio));
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(value.slice(offset, offset + 2), 16) * (1 - ratio) + 255 * ratio));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function accessoryIcon(id: AccessoryId): keyof typeof Ionicons.glyphMap {
  if (id === 'bright-star') return 'star';
  if (id === 'sunny-cap') return 'sunny';
  if (id === 'petal-pin') return 'flower';
  if (id === 'trail-scarf') return 'ribbon';
  if (id === 'cloud-mitts') return 'hand-left';
  if (id === 'meadow-socks') return 'footsteps';
  return 'ellipse-outline';
}

function categoryLabel(category: AccessoryCategory) {
  return category === 'mitts' ? 'Hand mitts' : category.charAt(0).toUpperCase() + category.slice(1);
}

function DataStatePanel({ palette, title, detail, loading, actionLabel, onAction }: { palette: Palette; title: string; detail: string; loading?: boolean; actionLabel?: string; onAction?: () => void }) {
  return <View accessibilityRole={loading ? undefined : 'summary'} style={[styles.dataState, { backgroundColor: withAlpha(palette.surfaceBright, 0.76), borderColor: palette.outlineVariant }]}>{loading ? <ActivityIndicator color={palette.deep} /> : <View style={[styles.dataStateIcon, { backgroundColor: palette.primaryContainer }]}><Ionicons name={actionLabel ? 'cloud-offline-outline' : 'sparkles-outline'} size={21} color={palette.onPrimaryContainer} /></View>}<View style={styles.dataStateCopy}><Text style={[styles.dataStateTitle, { color: palette.onSurface }]}>{title}</Text><Text style={[styles.dataStateDetail, { color: palette.onSurfaceVariant }]}>{detail}</Text></View>{actionLabel && onAction ? <Pressable onPress={onAction} accessibilityRole="button" style={[styles.dataStateAction, { backgroundColor: palette.deep }]}><Text style={styles.dataStateActionText}>{actionLabel}</Text></Pressable> : null}</View>;
}

function MarketplacePage({ user, token, palette, onPurchase, onContribute, onRedeemCoupon }: { user: User; token: string; palette: Palette; onPurchase: (id: AccessoryId, cost: number) => Promise<void>; onContribute: (points: number, causeId: string, causeName: string) => Promise<void>; onRedeemCoupon: (points: number, offerId: string, name: string) => Promise<void> }) {
  const [marketTab, setMarketTab] = useState<'accessories' | 'impact'>('accessories');
  const marketScrollRef = useRef<ScrollView>(null);
  const [selection, setSelection] = useState<MarketSelection | null>(null);
  const [success, setSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [impact, setImpact] = useState<ImpactSummary | null>(null);
  const impactCardRef = useRef<View>(null);
  useEffect(() => { getMemberImpact(token).then(setImpact).catch(() => setImpact(null)); }, [token, user.impact]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError('');
    try {
      const { items } = await getMemberMarket(token);
      setMarketItems(items);
    } catch (reason) {
      setMarketError(reason instanceof Error ? reason.message : 'The marketplace could not be loaded.');
    } finally {
      setMarketLoading(false);
    }
  }, [token]);
  useEffect(() => { void loadMarket(); }, [loadMarket]);
  const offers = useMemo<AccessoryOffer[]>(() => marketItems.filter((item) => item.category === 'accessory' && item.accessoryId).map((item) => ({ id: item.accessoryId!, price: item.price, description: item.description, imageDataUrl: item.imageDataUrl })), [marketItems]);
  const purposes = useMemo<PurposeOffer[]>(() => marketItems.filter((item) => item.category !== 'accessory').map((item) => ({ id: item.id, type: item.category as 'coupon' | 'charity', name: item.name, detail: item.description, description: item.description, icon: item.category === 'coupon' ? 'ticket' : 'heart', points: item.price, imageDataUrl: item.imageDataUrl })), [marketItems]);
  const closeSheet = () => { setSelection(null); setSuccess(false); setProcessing(false); };
  const confirmSelection = async () => {
    if (!selection || processing) return;
    setProcessing(true);
    try {
      if (selection.kind === 'accessory') await onPurchase(selection.offer.id, selection.offer.price);
      else if (selection.purpose.type === 'coupon') await onRedeemCoupon(selection.purpose.points, selection.purpose.id, selection.purpose.name);
      else await onContribute(selection.purpose.points, selection.purpose.id, selection.purpose.name);
      setSuccess(true);
    } catch {
      // The app-level mutation handler shows the API error. Keep this sheet open
      // so the user can try again without an unhandled promise.
    } finally {
      setProcessing(false);
    }
  };
  const selectedAccessory = selection?.kind === 'accessory' ? ACCESSORIES.find((item) => item.id === selection.offer.id) : undefined;
  const selectedAccessoryScheme = selectedAccessory ? createAccessoryColorScheme([selectedAccessory.id]) : palette;
  const selectedPoints = selection?.kind === 'accessory' ? selection.offer.price : selection?.purpose.points ?? 0;
  const selectedOwned = selection?.kind === 'accessory' && user.accessories.includes(selection.offer.id);
  const canConfirm = Boolean(selection) && !processing && user.points >= selectedPoints && !selectedOwned;
  const shareImpact = async () => {
    const message = `My verified novo impact: ${(impact?.personal.divertedKg ?? 0).toFixed(2)} kg diverted across ${impact?.personal.approvedActions ?? 0} actions. Small choices, real change.`;
    try {
      if (Platform.OS !== 'web' && impactCardRef.current && await Sharing.isAvailableAsync()) {
        const uri = await captureRef(impactCardRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your novo impact' });
        return;
      }
    } catch {
      // Fall back to the platform share sheet with an accessible text summary.
    }
    await Share.share({ title: 'My novo impact', message });
  };

  useEffect(() => {
    marketScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [marketTab]);

  return (
    <View style={styles.pagePad}>
      <PageTitle eyebrow="SPEND WITH PURPOSE" title="Marketplace" right={<View accessibilityLabel={`${user.points.toLocaleString()} leaves available`} style={[styles.balance, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={16} color={palette.onPrimary} /><Text style={[styles.balanceText, { color: palette.onPrimary }]}>{user.points.toLocaleString()}</Text></View>} />
      <View accessibilityRole="tablist" style={[styles.marketTabs, { backgroundColor: withAlpha(palette.surfaceContainer, 0.64) }]}><BlurView intensity={68} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />
        {(['accessories', 'impact'] as const).map((id) => {
          const selected = marketTab === id;
          return <Pressable key={id} onPress={() => setMarketTab(id)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.marketTab, selected && { backgroundColor: palette.deep }]}><Text style={[styles.marketTabText, { color: selected ? '#FFFFFF' : palette.onSurfaceVariant }]}>{id === 'accessories' ? 'Accessories' : 'Rewards & Impact'}</Text></Pressable>;
        })}
      </View>
      <ScrollView ref={marketScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.marketScroll, { paddingBottom: 104 }]}>
        {marketTab === 'accessories' ? (
          <>
            <View style={styles.marketHero}><LinearGradient colors={[palette.deep, palette.secondary]} style={StyleSheet.absoluteFill} /><View style={styles.marketOrb} /><Text style={styles.marketEyebrow}>FEATURED DROP</Text><Text style={styles.marketTitle}>Wear the change.</Text><Text style={styles.marketText}>Collect expressive pieces with the leaves you earn.</Text></View>
            {marketLoading ? <DataStatePanel palette={palette} loading title="Loading accessories" detail="Preparing the latest digital collection." /> : marketError ? <DataStatePanel palette={palette} title="Marketplace unavailable" detail={marketError} actionLabel="Try again" onAction={() => void loadMarket()} /> : <View style={styles.catalogGrid}>{offers.map((offer) => {
              const accessory = ACCESSORIES.find((item) => item.id === offer.id)!;
              const owned = user.accessories.includes(offer.id);
              const itemScheme = createAccessoryColorScheme([offer.id]);
              return <Pressable key={offer.id} onPress={() => { setSelection({ kind: 'accessory', offer }); setSuccess(false); }} accessibilityRole="button" accessibilityLabel={`${accessory.name}, ${offer.price} leaves${owned ? ', owned' : ''}`} accessibilityHint="Opens a preview and purchase details" style={({ pressed }) => [styles.catalogCard, { minHeight: 224, backgroundColor: palette.surfaceBright, borderColor: palette.outlineVariant }, pressed && styles.cardPressed]}><View style={[styles.catalogPreview, { backgroundColor: itemScheme.primaryContainer }]}>{offer.imageDataUrl ? <Image source={{ uri: offer.imageDataUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <AccessoryPreview3D id={offer.id} />}<View style={[styles.catalogRarity, { backgroundColor: rarityColors[accessory.rarity].background }]}><Text style={[styles.rarityText, { color: rarityColors[accessory.rarity].text }]}>{accessory.rarity}</Text></View></View><View style={styles.catalogInfo}><View style={styles.catalogCopy}><Text style={[styles.catalogName, { color: palette.onSurface }]} numberOfLines={2}>{accessory.name}</Text><Text style={[styles.catalogCategory, { color: palette.onSurfaceVariant }]}>{categoryLabel(accessory.category)}</Text></View><View style={[styles.catalogPrice, { backgroundColor: owned ? palette.successContainer : palette.deep }]}><Ionicons name={owned ? 'checkmark' : 'leaf'} size={14} color={owned ? palette.success : '#FFFFFF'} /><Text style={[styles.catalogBuyText, { color: owned ? palette.success : '#FFFFFF' }]}>{owned ? 'Owned' : `${offer.price} leaves`}</Text></View></View></Pressable>;
            })}</View>}
            {!marketLoading && !marketError && !offers.length && <DataStatePanel palette={palette} title="No accessories yet" detail="New digital pieces will appear here when they are available." />}
          </>
        ) : (
          marketLoading ? <DataStatePanel palette={palette} loading title="Loading rewards" detail="Finding current rewards and impact partners." /> : marketError ? <DataStatePanel palette={palette} title="Marketplace unavailable" detail={marketError} actionLabel="Try again" onAction={() => void loadMarket()} /> : <><View ref={impactCardRef} collapsable={false} style={[styles.impactShareCard, { backgroundColor: palette.deep }]}><View style={styles.impactShareHeader}><View><Text style={styles.impactShareEyebrow}>NOVO VERIFIED IMPACT</Text><Text style={styles.impactShareTitle}>Small choices, real change.</Text></View><Ionicons name="leaf" size={30} color={palette.primary} /></View><View style={styles.impactMetricGrid}><ImpactMetric icon="scale-outline" label="Personal" value={`${(impact?.personal.divertedKg ?? 0).toFixed(2)} kg`} /><ImpactMetric icon="people-outline" label="Community" value={`${(impact?.community.divertedKg ?? 0).toFixed(2)} kg`} /><ImpactMetric icon="restaurant-outline" label="Food CO₂e est." value={`${(impact?.personal.foodCo2eKg ?? 0).toFixed(2)} kg`} /><ImpactMetric icon="checkmark-circle-outline" label="Actions" value={String(impact?.personal.approvedActions ?? 0)} /></View><Text style={styles.impactMethod}>{impact?.foodCo2eMethod.caveat ?? 'Only approved, calibrated or measured tasks count.'}</Text></View><Pressable onPress={() => void shareImpact()} style={[styles.shareImpactButton, { backgroundColor: palette.primary }]} accessibilityRole="button" accessibilityLabel="Share impact image"><Ionicons name="share-social-outline" size={18} color={palette.onPrimary} /><Text style={[styles.shareImpactText, { color: palette.onPrimary }]}>Share impact card</Text></Pressable><View style={styles.impactHistoryRow}><ImpactHistoryCard icon="heart-outline" label="Charity" value={`${impact?.rewards.charityContributions.length ?? 0} contributions`} /><ImpactHistoryCard icon="ticket-outline" label="Rewards" value={`${impact?.rewards.redemptions.length ?? 0} redeemed`} /><ImpactHistoryCard icon="trophy-outline" label="Weekly" value={`${impact?.rewards.weeklyEntries.length ?? 0} entries`} /></View>{purposes.length ? <View style={styles.catalogGrid}>{purposes.map((purpose) => { const locked = user.points < purpose.points; return <Pressable key={purpose.id} disabled={locked} accessibilityRole="button" accessibilityLabel={`${purpose.name}, ${purpose.points} leaves${locked ? ', locked' : ''}`} accessibilityHint={locked ? `Earn ${purpose.points - user.points} more leaves to unlock` : 'Opens redemption details'} onPress={() => { setSelection({ kind: 'purpose', purpose }); setSuccess(false); }} style={({ pressed }) => [styles.catalogCard, { minHeight: 224, backgroundColor: palette.surfaceBright, borderColor: palette.outlineVariant }, locked && styles.marketLocked, pressed && styles.cardPressed]}><View style={[styles.catalogPreview, { backgroundColor: palette.tertiaryContainer }]}>{purpose.imageDataUrl ? <Image source={{ uri: purpose.imageDataUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name={locked ? 'lock-closed' : purpose.icon} size={42} color={palette.onTertiaryContainer} />}<View style={[styles.catalogRarity, { backgroundColor: withAlpha(palette.surfaceBright, 0.88) }]}><Text style={[styles.rarityText, { color: palette.deep }]}>{locked ? 'locked' : purpose.type}</Text></View></View><View style={styles.catalogInfo}><View style={styles.catalogCopy}><Text style={[styles.catalogName, { color: palette.onSurface }]} numberOfLines={2}>{purpose.name}</Text><Text style={[styles.catalogCategory, { color: palette.onSurfaceVariant }]} numberOfLines={2}>{locked ? `${purpose.points - user.points} more leaves needed` : purpose.detail}</Text></View><View style={[styles.catalogPrice, { backgroundColor: locked ? palette.surfaceContainerHigh : palette.deep }]}><Ionicons name={locked ? 'lock-closed' : 'leaf'} size={14} color={locked ? palette.onSurfaceVariant : '#FFFFFF'} /><Text style={[styles.catalogBuyText, locked && { color: palette.onSurfaceVariant }]}>{purpose.points.toLocaleString()} leaves</Text></View></View></Pressable>; })}</View> : <DataStatePanel palette={palette} title="No rewards yet" detail="Coupons and verified community causes will appear here." />}</>
        )}
      </ScrollView>

      <Modal visible={Boolean(selection)} animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
        <View style={styles.checkoutModal}>
          <FadeScrim />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close purchase details" />
          <RollingSheet style={[styles.checkoutSheet, { backgroundColor: 'rgba(255,255,255,0.62)' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: palette.outlineVariant }]} />
            <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Close purchase details" style={[styles.checkoutClose, { top: 16, right: 16, width: 44, height: 44, borderRadius: 15, backgroundColor: palette.surfaceContainer }]}><Ionicons name="close" size={21} color={palette.onSurface} /></Pressable>
            {success ? (
              <View style={styles.successPane}><ConfettiBurst colors={[palette.primary, palette.secondary, '#FF8178', '#55C4D8']} /><View style={[styles.successIcon, { backgroundColor: palette.primary }]}><Ionicons name="checkmark" size={38} color={colors.ink} /></View><Text style={styles.successTitle}>{selection?.kind === 'accessory' ? 'Unlocked!' : selection?.purpose.type === 'coupon' ? 'Coupon redeemed!' : 'Thank you!'}</Text><Text style={styles.successText}>{selection?.kind === 'accessory' ? `${selectedAccessory?.name} is ready to equip in your in-app wardrobe.` : selection?.purpose.type === 'coupon' ? `${selection.purpose.name} has been added to your account.` : `Your ${selectedPoints} leaves are now supporting ${selection?.purpose.name}.`}</Text><Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Done" style={[styles.doneButton, { backgroundColor: palette.deep }]}><Text style={styles.doneButtonText}>Done</Text></Pressable></View>
            ) : selection?.kind === 'accessory' && selectedAccessory ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checkoutContent}>
                <View style={[styles.tryOnStage, { backgroundColor: selectedAccessoryScheme.primaryContainer }]}><AccessoryGlow accessories={[selection.offer.id]} /><PlushieScene key={selection.offer.id} mascotType={user.mascotType} accessories={Array.from(new Set([...user.equippedAccessories, selection.offer.id]))} /><View style={[styles.tryOnLabel, { backgroundColor: withAlpha(palette.surfaceBright, 0.86) }]}><Ionicons name="sparkles" size={14} color={selectedAccessoryScheme.deep} /><Text style={[styles.tryOnLabelText, { color: selectedAccessoryScheme.deep }]}>Live try-on</Text></View></View>
                <View style={styles.checkoutHeading}><View style={{ flex: 1 }}><Text style={styles.checkoutEyebrow}>{selectedAccessory.rarity.toUpperCase()} · {categoryLabel(selectedAccessory.category).toUpperCase()}</Text><Text style={styles.checkoutTitle}>{selectedAccessory.name}</Text></View><View style={[styles.checkoutPrice, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={15} color={colors.ink} /><Text style={styles.checkoutPriceText}>{selection.offer.price}</Text></View></View>
                <Text style={styles.checkoutDescription}>{selection.offer.description}</Text>
                {selectedOwned ? <View style={styles.checkoutNotice}><Ionicons name="checkmark-circle" size={20} color={colors.forest} /><Text style={styles.checkoutNoticeText}>This accessory is already in your wardrobe.</Text></View> : user.points < selection.offer.price ? <View style={styles.checkoutNotice}><Ionicons name="leaf-outline" size={20} color={colors.danger} /><Text style={styles.checkoutNoticeText}>You need {selection.offer.price - user.points} more leaves.</Text></View> : null}
                <ConfirmSlider key={selection.offer.id} label={processing ? 'Unlocking accessory…' : `Slide to unlock · ${selection.offer.price} leaves`} color={palette.deep} disabled={!canConfirm} onConfirm={confirmSelection} />
                <Text style={styles.sliderHint}>Digital accessories unlock immediately for every compatible mascot.</Text>
              </ScrollView>
            ) : selection?.kind === 'purpose' ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.charityCheckout, { paddingTop: 24, paddingBottom: 4, gap: 10 }]}><View style={[styles.charityHeroIcon, { width: 78, height: 78, borderRadius: 26, backgroundColor: palette.tertiaryContainer }]}><Ionicons name={selection.purpose.icon} size={38} color={palette.onTertiaryContainer} /></View><Text style={[styles.checkoutEyebrow, { color: palette.deep }]}>{selection.purpose.type === 'coupon' ? 'POINTS REWARD' : 'COMMUNITY IMPACT'}</Text><Text style={[styles.checkoutTitle, { color: palette.onSurface }]}>{selection.purpose.name}</Text><Text style={[styles.checkoutDescription, styles.charityDescription, { color: palette.onSurfaceVariant }]}>{selection.purpose.description}</Text><View style={[styles.impactRow, { marginVertical: 2 }]}><View style={[styles.impactPill, { backgroundColor: palette.secondaryContainer }]}><Ionicons name="shield-checkmark-outline" size={16} color={palette.onSecondaryContainer} /><Text style={[styles.impactPillText, { color: palette.onSecondaryContainer }]}>Verified partner</Text></View><View style={[styles.impactPill, { backgroundColor: palette.tertiaryContainer }]}><Ionicons name={selection.purpose.type === 'coupon' ? 'ticket-outline' : 'receipt-outline'} size={16} color={palette.onTertiaryContainer} /><Text style={[styles.impactPillText, { color: palette.onTertiaryContainer }]}>{selection.purpose.type === 'coupon' ? 'Digital coupon' : 'Impact updates'}</Text></View></View><ConfirmSlider key={selection.purpose.id} label={processing ? 'Confirming…' : `Slide to ${selection.purpose.type === 'coupon' ? 'redeem' : 'give'} · ${selection.purpose.points} leaves`} color={palette.deep} disabled={!canConfirm} onConfirm={confirmSelection} /><Text style={styles.sliderHint}>Points transactions are final after confirmation.</Text></ScrollView>
            ) : null}
          </RollingSheet>
        </View>
      </Modal>
    </View>
  );
}

function ImpactMetric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.impactMetric}><Ionicons name={icon} size={19} color="#DFF77A" /><Text style={styles.impactMetricValue}>{value}</Text><Text style={styles.impactMetricLabel}>{label}</Text></View>;
}

function ImpactHistoryCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.impactHistoryCard}><Ionicons name={icon} size={18} color={colors.forest} /><View><Text style={styles.impactHistoryLabel}>{label}</Text><Text style={styles.impactHistoryValue}>{value}</Text></View></View>;
}

function ConfirmSlider({ label, color, disabled, onConfirm }: { label: string; color: string; disabled?: boolean; onConfirm: () => Promise<void> }) {
  const scheme = useDynamicScheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const maxDistance = () => Math.max(0, width.current - 58);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dx) > 2,
    onPanResponderMove: (_event, gesture) => translateX.setValue(Math.max(0, Math.min(maxDistance(), gesture.dx))),
    onPanResponderRelease: (_event, gesture) => {
      const maximum = maxDistance();
      if (maximum > 0 && gesture.dx >= maximum * 0.78) {
        Animated.timing(translateX, { toValue: maximum, duration: 130, useNativeDriver: useNativeAnimationDriver }).start(() => void onConfirm());
      } else Animated.spring(translateX, { toValue: 0, useNativeDriver: useNativeAnimationDriver, speed: 22, bounciness: 7 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: useNativeAnimationDriver }).start(),
  }), [disabled, onConfirm, translateX]);

  useEffect(() => { translateX.setValue(0); }, [disabled, translateX]);
  return <View onLayout={(event) => { width.current = event.nativeEvent.layout.width; }} style={[styles.confirmSlider, { backgroundColor: scheme.surfaceContainerHigh }, disabled && styles.confirmSliderDisabled]} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityHint="Drag the leaf to the right to confirm" accessibilityActions={[{ name: 'activate', label: 'Confirm' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate' && !disabled) void onConfirm(); }}><Text style={[styles.confirmSliderText, { color: scheme.onSurfaceVariant }]}>{label}</Text><Animated.View {...pan.panHandlers} style={[styles.confirmKnob, { backgroundColor: color, transform: [{ translateX }] }]}><Ionicons name="leaf" size={21} color="#FFFFFF" /><Ionicons name="chevron-forward" size={13} color="#FFFFFF" /></Animated.View></View>;
}

function ConfettiBurst({ colors: confettiColors }: { colors: string[] }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: 24 }, (_, index) => ({ left: `${(index * 37) % 96}%` as DimensionValue, delay: (index % 6) * 45, color: confettiColors[index % confettiColors.length], rotate: `${(index * 53) % 180}deg` })), [confettiColors]);
  useEffect(() => { Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: useNativeAnimationDriver }).start(); }, [progress]);
  return <View style={[styles.confettiLayer, { pointerEvents: 'none' }]}>{pieces.map((piece, index) => <Animated.View key={index} style={[styles.confettiPiece, { left: piece.left, top: -12, backgroundColor: piece.color, opacity: progress.interpolate({ inputRange: [0, 0.15, 0.88, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 330 + piece.delay] }) }, { rotate: piece.rotate }] }]} />)}</View>;
}

function FadeScrim() {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: useNativeAnimationDriver }).start();
  }, [opacity]);
  return <Animated.View style={[StyleSheet.absoluteFill, styles.modalScrim, { backgroundColor: 'rgba(0,0,0,0.3)', opacity, pointerEvents: 'none' }]} />;
}

function RollingSheet({ children, style }: { children: ReactNode; style: object }) {
  const translateY = useRef(new Animated.Value(560)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 230, mass: 0.9, useNativeDriver: useNativeAnimationDriver }).start();
  }, [translateY]);
  return <Animated.View style={[style, { backgroundColor: 'rgba(250,252,248,0.68)', transform: [{ translateY }] }]}><BlurView intensity={78} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />{children}</Animated.View>;
}

function TasksPage({ token, palette, onUserUpdated }: { token: string; palette: Palette; onUserUpdated: (user: User) => Promise<void> }) {
  const [view, setView] = useState<'map' | 'tasks'>('map');
  const [locations, setLocations] = useState<NovoLocation[]>([]);
  const [events, setEvents] = useState<NovoEvent[]>([]);
  const [quests, setQuests] = useState<User['dailyQuests']>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeQuest, setActiveQuest] = useState<User['dailyQuests'][number] | null>(null);
  const [activeEvent, setActiveEvent] = useState<NovoEvent | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focusUser, setFocusUser] = useState(0);
  const [locating, setLocating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [lessonWatched, setLessonWatched] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyCompetition | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyAnswers, setWeeklyAnswers] = useState<Record<string, number>>({});
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [eventBusy, setEventBusy] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const isVideoQuiz = activeQuest?.kind === 'video-quiz';
  const submissionIssue = isVideoQuiz
    ? !lessonWatched ? 'Watch the short lesson before answering.' : !quizAnswer ? 'Choose an answer to complete the knowledge check.' : null
    : !photo
    ? 'Add a photo of your completed task.'
    : trimmedTitle.length < 3
      ? 'Give your task a title with at least 3 characters.'
      : trimmedDescription.length < 10
        ? `Add ${10 - trimmedDescription.length} more description character${10 - trimmedDescription.length === 1 ? '' : 's'}.`
        : null;

  const refresh = async () => {
    setLoadError('');
    try {
      const [nextLocations, tasks] = await Promise.all([getLocations('return-right'), getMemberTasks(token)]);
      setLocations(nextLocations.filter((location) => location.kind === 'return-right'));
      setQuests(tasks.quests);
      setEvents(tasks.events);
      setSubmissions(tasks.submissions);
      setWeekly(tasks.weeklyCompetition);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Tasks could not be loaded.');
      throw reason;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { setLoading(true); refresh().catch(() => undefined); }, [token]);
  const locateUser = async (showError = true) => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Enable location access to see yourself and nearby activities on the map.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserLocation({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      setFocusUser((current) => current + 1);
    } catch (reason) {
      if (showError) Alert.alert('Location unavailable', reason instanceof Error ? reason.message : 'Could not find your current location.');
    } finally { setLocating(false); }
  };
  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    void Location.requestForegroundPermissionsAsync().then(async (permission) => {
      if (!active || !permission.granted) return;
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 15 }, (position) => {
        if (active) setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      });
    }).catch(() => undefined);
    return () => { active = false; subscription?.remove(); };
  }, []);

  const openTask = (quest: User['dailyQuests'][number] | null) => {
    setActiveQuest(quest);
    setTitle(quest?.title ?? '');
    setDescription(''); setPhoto(null); setLessonWatched(false); setQuizAnswer(''); setSubmissionError(null); setComposerOpen(true);
  };

  const reopenSubmission = (submission: TaskSubmission) => {
    if (submission.status !== 'changes_requested') return;
    const quest = submission.questId ? quests.find((item) => item.id === submission.questId) ?? null : null;
    openTask(quest);
    setTitle(quest?.title ?? submission.task);
    setDescription(submission.note);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to submit photo evidence.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: false, quality: 0.65 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.uri) return;
    try {
      const resized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1024 } }], { compress: 0.54, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!resized.base64) throw new Error('The camera did not return image data.');
      setPhoto({ uri: resized.uri, dataUrl: `data:image/jpeg;base64,${resized.base64}` });
      setSubmissionError(null);
    } catch (reason) {
      Alert.alert('Could not prepare photo', reason instanceof Error ? reason.message : 'Take the evidence photo again.');
    }
  };

  const submit = async () => {
    if (submissionIssue || (!isVideoQuiz && !photo)) {
      setSubmissionError(submissionIssue ?? 'Complete the required fields before submitting.');
      return;
    }
    if (submitting) return;
    setSubmissionError(null);
    setSubmitting(true);
    try {
      let result;
      if (isVideoQuiz && activeQuest) result = await submitDailyQuiz(token, activeQuest.id, quizAnswer);
      else if (activeQuest && photo) result = await submitDailyTask(token, activeQuest.id, { description: trimmedDescription, photoDataUrl: photo.dataUrl });
      else if (photo) result = await submitCustomTask(token, { title: trimmedTitle, description: trimmedDescription, photoDataUrl: photo.dataUrl });
      else throw new Error('Take a camera photo before submitting.');
      await onUserUpdated(result.user);
      setComposerOpen(false); setActiveQuest(null); setTitle(''); setDescription(''); setPhoto(null);
      await refresh().catch(() => undefined);
      Alert.alert(result.automated ? 'Task verified' : 'Sent for review', isVideoQuiz ? `${result.submission.points} leaves were added for completing today’s lesson.` : result.automated ? `The evidence cleared the 80% confidence threshold. ${result.submission.points} leaves were added.` : 'Staff will check your photo and choose the final leaf reward.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Try again.';
      setSubmissionError(message);
      Alert.alert('Could not submit task', message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEventRegistration = async () => {
    if (!activeEvent || eventBusy) return;
    setEventBusy(true);
    try {
      const updated = activeEvent.registered
        ? await cancelEventSignup(token, activeEvent.id)
        : await signUpForEvent(token, activeEvent.id);
      setActiveEvent(updated);
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
    } catch (reason) { Alert.alert(activeEvent.registered ? 'Could not cancel registration' : 'Could not register', reason instanceof Error ? reason.message : 'Try again.'); }
    finally { setEventBusy(false); }
  };
  const selectMapEvent = useCallback((eventId: string) => setActiveEvent(events.find((event) => event.id === eventId) ?? null), [events]);

  useEffect(() => {
    if (!weeklyOpen || !weekly?.entry?.startedAt || weekly.entry.completedAt) return undefined;
    const interval = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(interval);
  }, [weeklyOpen, weekly?.entry?.startedAt, weekly?.entry?.completedAt]);
  const weeklyRemaining = weekly?.entry?.startedAt && !weekly.entry.completedAt ? Math.max(0, weekly.durationSeconds - Math.floor((clock - Date.parse(weekly.entry.startedAt)) / 1000)) : weekly?.durationSeconds ?? 0;
  const openWeekly = async () => {
    if (!weekly) return;
    setWeeklyOpen(true); setWeeklyError(''); setClock(Date.now());
    if (weekly.entry) return;
    setWeeklyBusy(true);
    try { const result = await startWeeklyCompetition(token); setWeekly(result.weeklyCompetition); setClock(Date.now()); }
    catch (reason) { setWeeklyError(reason instanceof Error ? reason.message : 'Could not start this week’s competition.'); }
    finally { setWeeklyBusy(false); }
  };
  const finishWeekly = async () => {
    if (!weekly || weeklyBusy) return;
    const answers = weekly.questions.map((question) => weeklyAnswers[question.id]);
    if (answers.some((answer) => answer === undefined)) return setWeeklyError('Answer all four questions before submitting.');
    setWeeklyBusy(true); setWeeklyError('');
    try { const result = await completeWeeklyCompetition(token, answers as number[]); setWeekly(result.weeklyCompetition); await onUserUpdated(result.user); }
    catch (reason) { setWeeklyError(reason instanceof Error ? reason.message : 'Could not submit the sprint.'); }
    finally { setWeeklyBusy(false); }
  };

  const tabs = <View accessibilityRole="tablist" style={[styles.tasksTabs, { backgroundColor: withAlpha(palette.surfaceContainer, 0.66), borderColor: palette.outlineVariant }]}><BlurView intensity={70} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />{(['map', 'tasks'] as const).map((item) => <Pressable key={item} onPress={() => setView(item)} accessibilityRole="tab" accessibilityState={{ selected: view === item }} style={[styles.tasksTab, view === item && { backgroundColor: palette.deep }]}><Ionicons name={item === 'map' ? 'map-outline' : 'list-outline'} size={17} color={view === item ? '#FFFFFF' : palette.onSurfaceVariant} /><Text style={[styles.tasksTabText, { color: view === item ? '#FFFFFF' : palette.onSurfaceVariant }]}>{item === 'map' ? 'Map' : 'Tasks'}</Text></Pressable>)}</View>;

  return (
    <View style={styles.mapPage}>
      <TasksMap locations={locations} events={events} userLocation={userLocation} focusUser={focusUser} onEventPress={selectMapEvent} />
      <LinearGradient colors={[withAlpha(palette.background, 0.94), withAlpha(palette.background, 0)]} style={[styles.mapTopFade, { pointerEvents: 'none' }]} />
      <View style={styles.mapControls}><View style={styles.tasksControlRow}>{tabs}<Pressable onPress={() => void locateUser()} accessibilityRole="button" style={[styles.locateButton, { backgroundColor: userLocation ? palette.primary : withAlpha(palette.surfaceContainer, 0.72) }]} accessibilityLabel="Show my current location" accessibilityState={{ busy: locating }}><Ionicons name={locating ? 'hourglass-outline' : 'navigate'} size={20} color={userLocation ? palette.onPrimary : palette.onSurface} /></Pressable></View>{view === 'map' && <View style={[styles.mapLegend, { backgroundColor: withAlpha(palette.surfaceContainerLow, 0.72), borderColor: palette.outlineVariant }]}><BlurView intensity={62} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} /><View style={[styles.legendDot, { backgroundColor: palette.eventLive }]} /><Text style={[styles.legendText, { color: palette.onSurfaceVariant }]}>Live</Text><View style={[styles.legendDot, { backgroundColor: palette.tertiary }]} /><Text style={[styles.legendText, { color: palette.onSurfaceVariant }]}>Scheduled</Text><View style={[styles.legendDot, { borderWidth: 2, borderColor: palette.primary, backgroundColor: '#FFFFFF' }]} /><Text style={[styles.legendText, { color: palette.onSurfaceVariant }]}>Joined</Text><View style={[styles.legendSquare, { backgroundColor: palette.success }]} /><Text style={[styles.legendText, { color: palette.onSurfaceVariant }]}>Return-Right</Text></View>}</View>
      {loadError ? <Pressable onPress={() => void refresh().catch(() => undefined)} accessibilityRole="button" accessibilityLabel="Retry loading tasks" style={[styles.tasksErrorBanner, { backgroundColor: palette.errorContainer }]}><Ionicons name="cloud-offline-outline" size={18} color={palette.error} /><Text style={[styles.taskFormMessageText, { color: palette.error }]} numberOfLines={2}>{loadError}</Text><Text style={{ color: palette.error, fontWeight: '900' }}>Retry</Text></Pressable> : null}
      {view === 'map' ? <GlassPanel style={styles.taskSheet}><View style={[styles.sheetHandle, { backgroundColor: palette.outlineVariant }]} /><View style={styles.taskSheetHeader}><View style={{ flex: 1 }}><Text style={[styles.taskSheetTitle, { color: palette.onSurface }]}>Today’s quest board</Text><Text style={[styles.taskSheetSub, { color: palette.onSurfaceVariant }]}>{quests.length ? `Tap a task to open it${quests.length > 1 ? ' · swipe for more →' : ''}` : 'Tap your wristband to reveal today’s quests'}</Text></View><View style={[styles.questCount, { backgroundColor: palette.primary }]}><Text style={[styles.questCountText, { color: palette.onPrimary }]}>{quests.length}</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questBoard}>{quests.length ? quests.map((quest) => <QuestCard key={quest.id} quest={quest} compact onPress={() => openTask(quest)} />) : <Text style={[styles.taskSheetSub, { color: palette.onSurfaceVariant }]}>Your random daily quests appear after today’s wristband tap.</Text>}</ScrollView></GlassPanel> : <View style={[styles.tasksListPage, { backgroundColor: withAlpha(palette.surface, 0.98), borderColor: palette.outlineVariant }]}>
        <View style={styles.tasksListHeader}><View><Text style={styles.pageEyebrow}>QUESTS & EVENTS</Text><Text style={styles.taskPanelTitle}>Things to do</Text></View><Pressable onPress={() => openTask(null)} accessibilityRole="button" accessibilityLabel="Create a custom task" style={[styles.locateButton, { backgroundColor: palette.primary }]}><Ionicons name="camera" size={20} color={colors.ink} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tasksScroll}>
          {weekly && <Pressable onPress={() => void openWeekly()} accessibilityRole="button" accessibilityLabel={`${weekly.title}, weekly timed competition`} style={[styles.weeklyCard, { backgroundColor: palette.deep }]}><View style={styles.weeklyTop}><View style={styles.weeklyIcon}><Ionicons name="flash" size={22} color={palette.deep} /></View><View style={{ flex: 1 }}><Text style={styles.weeklyEyebrow}>WEEKLY SPEED QUEST</Text><Text style={styles.weeklyTitle}>{weekly.title}</Text></View><Ionicons name="chevron-forward" size={20} color="#FFFFFF" /></View><Text style={styles.weeklyDescription}>{weekly.description}</Text><View style={styles.weeklyMeta}><Text style={styles.weeklyMetaText}>{weekly.entry?.completedAt ? `Rank #${weekly.entry.rank} · +${weekly.entry.pointsAwarded} leaves` : `${weekly.durationSeconds}s · fastest correct finish wins`}</Text></View></Pressable>}
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Daily tasks</Text><Text style={styles.taskSectionSub}>Randomised for everyone and refreshed by wristband.</Text></View><View style={[styles.questCount, { backgroundColor: palette.primary }]}><Text style={styles.questCountText}>{quests.length}</Text></View></View>
          <View style={styles.dailyQuestList}>{quests.length ? quests.map((quest) => <QuestCard key={quest.id} quest={quest} onPress={() => openTask(quest)} />) : <Text style={styles.emptyState}>Tap your wristband with NFC to refresh today’s quests.</Text>}</View>
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Events</Text><Text style={styles.taskSectionSub}>{events.length} live or scheduled near you</Text></View></View>
          <View style={styles.eventList}>{events.length ? events.map((event) => <EventCard key={event.id} event={event} onPress={() => setActiveEvent(event)} />) : <Text style={styles.emptyState}>No live or scheduled events are available.</Text>}</View>
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Your submissions</Text><Text style={styles.taskSectionSub}>Photo tasks awaiting or past review.</Text></View><Pressable onPress={() => openTask(null)} accessibilityRole="button" accessibilityLabel="Create a new custom task" style={[styles.livePill, { backgroundColor: palette.primary }]}><Ionicons name="add" size={15} color={colors.ink} /><Text style={styles.liveText}>NEW</Text></Pressable></View>
          <View style={styles.eventList}>{submissions.length ? submissions.map((submission) => <Pressable key={submission.id} disabled={submission.status !== 'changes_requested'} onPress={() => reopenSubmission(submission)} accessibilityRole={submission.status === 'changes_requested' ? 'button' : undefined} accessibilityHint={submission.status === 'changes_requested' ? 'Opens this task so you can submit new camera evidence' : undefined} style={({ pressed }) => [styles.submissionCard, submission.status === 'changes_requested' && { borderColor: palette.error }, pressed && styles.cardPressed]}><View style={[styles.submissionIcon, { backgroundColor: submission.status === 'approved' ? '#DFF4E6' : submission.status === 'changes_requested' ? palette.errorContainer : '#EEE8FF' }]}><Ionicons name={submission.status === 'approved' ? 'checkmark' : submission.status === 'changes_requested' ? 'refresh' : 'time-outline'} size={18} color={submission.status === 'approved' ? colors.forest : submission.status === 'changes_requested' ? palette.error : colors.purple} /></View><View style={{ flex: 1 }}><Text style={styles.nearbyTitle}>{submission.task}</Text><Text style={styles.nearbyMeta}>{submission.status === 'pending' ? 'Waiting for staff review' : submission.status === 'changes_requested' ? submission.reviewNote ?? 'Changes requested — tap to resubmit' : 'Approved'}</Text></View>{submission.points ? <Text style={styles.distance}>+{submission.points}</Text> : submission.status === 'changes_requested' ? <Ionicons name="chevron-forward" size={18} color={palette.error} /> : null}</Pressable>) : loading ? <ActivityIndicator color={palette.deep} /> : <Text style={styles.emptyState}>No task submissions yet.</Text>}</View>
        </ScrollView>
      </View>}
      <Modal visible={weeklyOpen} transparent animationType="none" statusBarTranslucent onRequestClose={() => setWeeklyOpen(false)}><View style={styles.taskModal}><FadeScrim /><Pressable style={StyleSheet.absoluteFill} onPress={() => setWeeklyOpen(false)} accessibilityLabel="Close weekly competition" /><RollingSheet style={styles.weeklySheet}>{weekly && <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weeklySheetContent}><View style={styles.taskComposerHead}><View style={{ flex: 1 }}><Text style={[styles.pageEyebrow, { color: palette.deep }]}>WEEKLY SPEED QUEST</Text><Text style={[styles.taskComposerTitle, { color: palette.onSurface }]}>{weekly.title}</Text></View><View style={[styles.weeklyTimer, { backgroundColor: weeklyRemaining <= 20 ? palette.errorContainer : palette.primaryContainer }]}><Ionicons name="timer-outline" size={17} color={weeklyRemaining <= 20 ? palette.error : palette.onPrimaryContainer} /><Text style={{ color: weeklyRemaining <= 20 ? palette.error : palette.onPrimaryContainer, fontWeight: '900' }}>{weekly.entry?.completedAt ? 'DONE' : `${weeklyRemaining}s`}</Text></View></View>{weekly.entry?.completedAt ? <><View style={[styles.weeklyResult, { backgroundColor: palette.successContainer }]}><Ionicons name="trophy" size={34} color={palette.success} /><Text style={[styles.weeklyResultTitle, { color: palette.success }]}>Rank #{weekly.entry.rank}</Text><Text style={[styles.weeklyResultText, { color: palette.onSurfaceVariant }]}>{(weekly.entry.elapsedMs! / 1000).toFixed(1)} seconds · +{weekly.entry.pointsAwarded} leaves</Text></View><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>This week’s fastest</Text>{weekly.leaderboard.map((entry) => <View key={`${entry.rank}-${entry.name}`} style={[styles.weeklyLeader, entry.isCurrentUser && { backgroundColor: palette.primaryContainer }]}><Text style={[styles.weeklyRank, { color: palette.deep }]}>#{entry.rank}</Text><Text style={[styles.weeklyLeaderName, { color: palette.onSurface }]}>{entry.name}</Text><Text style={[styles.weeklyLeaderTime, { color: palette.onSurfaceVariant }]}>{(entry.elapsedMs / 1000).toFixed(1)}s</Text></View>)}</> : weekly.entry ? <>{weekly.questions.map((question, questionIndex) => <View key={question.id} style={styles.weeklyQuestion}><Text style={[styles.weeklyPrompt, { color: palette.onSurface }]}>{questionIndex + 1}. {question.prompt}</Text>{question.options.map((option, optionIndex) => <Pressable key={option} onPress={() => { setWeeklyAnswers((current) => ({ ...current, [question.id]: optionIndex })); setWeeklyError(''); }} accessibilityRole="radio" accessibilityState={{ selected: weeklyAnswers[question.id] === optionIndex }} style={[styles.weeklyOption, { backgroundColor: weeklyAnswers[question.id] === optionIndex ? palette.primaryContainer : palette.surfaceContainerLow, borderColor: weeklyAnswers[question.id] === optionIndex ? palette.deep : palette.outlineVariant }]}><Text style={{ color: palette.onSurface }}>{option}</Text></Pressable>)}</View>)}{weeklyError ? <Text style={[styles.taskFormMessageText, { color: palette.error }]}>{weeklyError}</Text> : null}<Pressable disabled={weeklyBusy || weeklyRemaining <= 0} onPress={() => void finishWeekly()} style={[styles.taskSubmit, { backgroundColor: weeklyRemaining <= 0 ? palette.surfaceContainerHigh : palette.deep }]}>{weeklyBusy && <ActivityIndicator color="#FFFFFF" />}<Text style={styles.taskSubmitText}>{weeklyRemaining <= 0 ? 'Time is up' : 'Lock in answers'}</Text></Pressable></> : <View style={styles.weeklyResult}><ActivityIndicator color={palette.deep} /><Text style={[styles.weeklyResultText, { color: palette.onSurfaceVariant }]}>Starting your private timer…</Text>{weeklyError ? <Text style={{ color: palette.error }}>{weeklyError}</Text> : null}</View>}</ScrollView>}</RollingSheet></View></Modal>
      <Modal visible={composerOpen} transparent animationType="none" statusBarTranslucent onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.taskModal}>
          <FadeScrim />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setComposerOpen(false)} accessibilityLabel="Close task submission" />
          <RollingSheet style={[styles.taskComposer, { backgroundColor: 'rgba(255,255,255,0.62)' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: palette.outlineVariant }]} />
            <View style={styles.taskComposerHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pageEyebrow, { color: palette.deep }]}>{activeQuest ? 'DAILY TASK' : 'CUSTOM TASK'}</Text>
                <Text style={[styles.taskComposerTitle, { color: palette.onSurface }]}>{activeQuest ? activeQuest.title : 'Show what you changed'}</Text>
                {activeQuest && <Text style={[styles.taskSectionSub, { color: palette.onSurfaceVariant }]}>Worth {activeQuest.points} leaves · {activeQuest.description}</Text>}
              </View>
              <Pressable onPress={() => setComposerOpen(false)} accessibilityRole="button" accessibilityLabel="Close task submission" style={[styles.miniClose, { backgroundColor: palette.surfaceContainer }]}>
                <Ionicons name="close" size={18} color={palette.onSurface} />
              </Pressable>
            </View>
            {isVideoQuiz && activeQuest?.lesson ? <>
              <Pressable onPress={() => { setLessonWatched(true); setSubmissionError(null); }} accessibilityRole="button" accessibilityLabel={lessonWatched ? 'Replay sustainability lesson' : 'Play sustainability lesson'} style={[styles.photoEvidence, { minHeight: 142, backgroundColor: palette.secondaryContainer }]}>
                <Ionicons name={lessonWatched ? 'checkmark-circle' : 'play-circle'} size={42} color={palette.onSecondaryContainer} />
                <Text style={[styles.photoEvidenceText, { color: palette.onSecondaryContainer }]}>{lessonWatched ? 'Lesson watched' : 'Play short lesson'}</Text>
                <Text style={[styles.aiNoticeText, { color: palette.onSecondaryContainer, textAlign: 'center', paddingHorizontal: 24 }]}>{activeQuest.lesson.summary}</Text>
              </Pressable>
              <Text style={[styles.sectionTitle, { color: palette.onSurface }]}>{activeQuest.lesson.question}</Text>
              {activeQuest.lesson.options.map((option) => <Pressable key={option} onPress={() => { setQuizAnswer(option); setSubmissionError(null); }} accessibilityRole="radio" accessibilityState={{ selected: quizAnswer === option }} style={[styles.taskInput, { minHeight: 48, backgroundColor: quizAnswer === option ? palette.primaryContainer : palette.surfaceContainerLow, justifyContent: 'center' }]}><Text style={{ color: quizAnswer === option ? palette.onPrimaryContainer : palette.onSurface }}>{option}</Text></Pressable>)}
            </> : <>
              {!activeQuest && <TextInput value={title} onChangeText={(value) => { setTitle(value); setSubmissionError(null); }} placeholder="Task title" placeholderTextColor={palette.onSurfaceVariant} style={[styles.taskInput, { backgroundColor: palette.surfaceContainerLow, color: palette.onSurface }]} />}
              <TextInput value={description} onChangeText={(value) => { setDescription(value); setSubmissionError(null); }} placeholder="Describe what you did and how it reduced waste" placeholderTextColor={palette.onSurfaceVariant} multiline style={[styles.taskInput, styles.taskDescription, { backgroundColor: palette.surfaceContainerLow, color: palette.onSurface }]} />
              <Pressable onPress={takePhoto} accessibilityRole="button" accessibilityLabel={photo ? 'Retake evidence photo' : 'Take evidence photo'} style={[styles.photoEvidence, { backgroundColor: palette.secondaryContainer }]}>
                {photo ? <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} /> : <><Ionicons name="camera-outline" size={28} color={palette.onSecondaryContainer} /><Text style={[styles.photoEvidenceText, { color: palette.onSecondaryContainer }]}>Take evidence photo in novo</Text></>}
              </Pressable>
              <View style={[styles.aiNotice, { backgroundColor: palette.tertiaryContainer }]}>
                <Ionicons name="sparkles" size={18} color={palette.onTertiaryContainer} />
                <Text style={[styles.aiNoticeText, { color: palette.onTertiaryContainer }]}>{activeQuest?.impact?.reviewMode === 'staff' ? 'This task always goes to a staff reviewer. YOLO may describe visible items, but it does not approve receipts or invent weight.' : 'Camera-only evidence is fingerprinted and compared with model embeddings. YOLO can verify visible items; impact weight counts only when a 10-item measured calibration exists.'}</Text>
              </View>
            </>}
            {(submissionError || submissionIssue) && <View accessibilityLiveRegion="polite" style={[styles.taskFormMessage, { backgroundColor: submissionError ? palette.errorContainer : palette.surfaceContainerLow }]}>
              <Ionicons name={submissionError ? 'alert-circle-outline' : 'information-circle-outline'} size={17} color={submissionError ? palette.error : palette.onSurfaceVariant} />
              <Text style={[styles.taskFormMessageText, { color: submissionError ? palette.error : palette.onSurfaceVariant }]}>{submissionError ?? submissionIssue}</Text>
            </View>}
            <Pressable
              disabled={submitting}
              onPress={submit}
              accessibilityRole="button"
              accessibilityHint={submissionIssue ?? 'Submits this task evidence for verification'}
              accessibilityState={{ disabled: submitting, busy: submitting }}
              style={({ pressed }) => [styles.taskSubmit, { backgroundColor: submissionIssue ? palette.surfaceContainerHigh : palette.deep }, submissionIssue && styles.taskSubmitNeedsInput, pressed && !submitting && styles.cardPressed]}
            >
              {submitting && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text style={[styles.taskSubmitText, submissionIssue && { color: palette.onSurfaceVariant }]}>{submitting ? 'Checking…' : isVideoQuiz ? 'Submit knowledge check' : activeQuest ? 'Submit task evidence' : 'Submit custom task'}</Text>
            </Pressable>
          </RollingSheet>
        </View>
      </Modal>
      <Modal visible={Boolean(activeEvent)} transparent animationType="none" statusBarTranslucent onRequestClose={() => setActiveEvent(null)}><View style={styles.taskModal}><FadeScrim /><Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveEvent(null)} accessibilityLabel="Close event details" /><RollingSheet style={[styles.eventDetailSheet, { backgroundColor: 'rgba(255,255,255,0.88)' }]}>{activeEvent && <><View style={[styles.eventDetailHero, { backgroundColor: activeEvent.status === 'live' ? palette.eventLive : palette.deep }]}><View style={styles.eventSheetHandle} /><Text style={styles.eventDetailEyebrow}>{activeEvent.status === 'live' ? 'LIVE NOW' : 'UPCOMING EVENT'}</Text><Text style={styles.eventDetailPoints}>+{activeEvent.points} leaves</Text></View><View style={styles.eventDetailContent}><Text style={[styles.eventDetailTitle, { color: palette.onSurface }]}>{activeEvent.title}</Text><View style={styles.eventDetailLine}><Ionicons name="location-outline" size={18} color={palette.deep} /><Text style={[styles.eventDetailMeta, { color: palette.onSurfaceVariant }]}>{activeEvent.location}</Text></View><View style={styles.eventDetailLine}><Ionicons name="calendar-outline" size={18} color={palette.deep} /><Text style={[styles.eventDetailMeta, { color: palette.onSurfaceVariant }]}>{new Date(activeEvent.startsAt).toLocaleString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} · {activeEvent.durationMinutes} min</Text></View><View style={styles.eventDetailLine}><Ionicons name="people-outline" size={18} color={palette.deep} /><Text style={[styles.eventDetailMeta, { color: palette.onSurfaceVariant }]}>{activeEvent.attending}{activeEvent.capacity ? ` of ${activeEvent.capacity}` : ''} registered</Text></View><Pressable disabled={eventBusy || (!activeEvent.registered && activeEvent.capacity !== null && activeEvent.attending >= activeEvent.capacity)} onPress={() => void toggleEventRegistration()} accessibilityRole="button" accessibilityState={{ disabled: eventBusy || (!activeEvent.registered && activeEvent.capacity !== null && activeEvent.attending >= activeEvent.capacity), busy: eventBusy }} style={[styles.taskSubmit, { backgroundColor: activeEvent.registered ? palette.errorContainer : palette.deep }]}>{eventBusy ? <ActivityIndicator size="small" color={activeEvent.registered ? palette.error : '#FFFFFF'} /> : null}<Text style={[styles.taskSubmitText, activeEvent.registered && { color: palette.error }]}>{activeEvent.registered ? 'Cancel registration' : activeEvent.capacity !== null && activeEvent.attending >= activeEvent.capacity ? 'Event full' : 'Sign up for this event'}</Text></Pressable></View></>}</RollingSheet></View></Modal>
    </View>
  );
}

function QuestCard({ quest, compact = false, onPress }: { quest: User['dailyQuests'][number]; compact?: boolean; onPress: () => void }) {
  const scheme = useDynamicScheme();
  const sourceAccessory = quest.sourceAccessoryId ? ACCESSORIES.find((item) => item.id === quest.sourceAccessoryId) : null;
  return <Pressable onPress={onPress} disabled={quest.completed} accessibilityRole="button" accessibilityState={{ disabled: quest.completed }} accessibilityLabel={`${quest.title}, ${quest.completed ? 'completed' : `${quest.points} leaves`}${sourceAccessory ? `, inspired by ${sourceAccessory.name}` : ''}`} accessibilityHint={quest.completed ? undefined : quest.kind === 'video-quiz' ? 'Opens a video lesson and knowledge check' : 'Opens in-app camera evidence submission'} style={({ pressed }) => [styles.questCard, { backgroundColor: withAlpha(scheme.surfaceBright, 0.9), borderColor: scheme.outlineVariant }, compact && styles.questCardCompact, quest.completed && styles.completedTask, pressed && !quest.completed && styles.cardPressed]}><View style={styles.questCardTop}><View style={[styles.questPoints, { backgroundColor: scheme.primaryContainer }]}><Ionicons name={quest.completed ? 'checkmark' : quest.kind === 'video-quiz' ? 'play' : 'leaf'} size={12} color={scheme.onPrimaryContainer} /><Text style={[styles.questPointsText, { color: scheme.onPrimaryContainer }]}>{quest.completed ? 'Done' : quest.points}</Text></View>{quest.impact ? <View style={[styles.questSource, { backgroundColor: quest.impact.reviewMode === 'staff' ? scheme.tertiaryContainer : scheme.secondaryContainer }]}><Ionicons name={quest.impact.reviewMode === 'staff' ? 'person-outline' : 'sparkles-outline'} size={11} color={scheme.deep} /><Text style={[styles.questSourceText, { color: scheme.deep }]}>{quest.impact.reviewMode === 'staff' ? 'Staff review' : 'AI + calibration'}</Text></View> : sourceAccessory ? <View style={styles.questSource}><Ionicons name="color-palette-outline" size={12} color={colors.purple} /><Text style={styles.questSourceText} numberOfLines={1}>{sourceAccessory.name}</Text></View> : null}</View><Text style={[styles.questTitle, { color: scheme.onSurface }]}>{quest.title}</Text><Text numberOfLines={compact ? 2 : 3} style={[styles.questDescription, { color: scheme.onSurfaceVariant }]}>{quest.description}</Text></Pressable>;
}

function EventCard({ event, onPress }: { event: NovoEvent; onPress: () => void }) {
  const scheme = useDynamicScheme();
  const date = new Date(event.startsAt);
  const timing = event.status === 'live' ? 'Live now' : date.toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const eventColor = event.status === 'live' ? scheme.eventLive : scheme.tertiary;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${event.title}, ${timing}, ${event.points} leaves${event.registered ? ', registered' : ''}`} accessibilityHint="Opens event details" style={({ pressed }) => [styles.eventCard, { backgroundColor: withAlpha(scheme.surfaceBright, 0.84), borderColor: scheme.outlineVariant }, pressed && styles.cardPressed]}><View style={[styles.eventBadge, { backgroundColor: eventColor }]}><Text style={styles.eventBadgePoints}>{event.points}</Text><Text style={styles.eventBadgeLabel}>LEAVES</Text></View><View style={{ flex: 1 }}><View style={styles.eventStatusLine}><View style={[styles.eventStatusDot, { backgroundColor: eventColor }]} /><Text style={[styles.eventStatusText, { color: scheme.onSurfaceVariant }]}>{timing}{event.registered ? ' · Registered' : ''}</Text></View><Text style={[styles.eventTitle, { color: scheme.onSurface }]}>{event.title}</Text><Text style={[styles.eventMeta, { color: scheme.onSurfaceVariant }]}>{event.location} · {event.attending}{event.capacity ? `/${event.capacity}` : ''} going</Text></View><Ionicons name="chevron-forward" size={18} color={scheme.onSurfaceVariant} /></Pressable>;
}

function FriendsPage({ user, token, palette }: { user: User; token: string; palette: Palette }) {
  const inviteUrl = createFriendInviteUrl(user.id);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');
  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    setFriendsError('');
    try { setFriends(await getFriends(token)); }
    catch (reason) { setFriendsError(reason instanceof Error ? reason.message : 'Your friends could not be loaded.'); }
    finally { setFriendsLoading(false); }
  }, [token]);
  useEffect(() => { void loadFriends(); }, [loadFriends]);
  const shareInvite = () => Share.share({
    title: 'Join my novo circle',
    message: `Join my novo circle:\n${inviteUrl}`,
  });

  return (
    <View style={styles.pagePad}>
      <PageTitle eyebrow="YOUR CIRCLE" title="Friends" right={<Pressable onPress={shareInvite} accessibilityRole="button" accessibilityLabel="Share friend invite" style={[styles.roundButton, { backgroundColor: palette.primary }]}><Ionicons name="person-add" size={20} color={palette.onPrimary} /></Pressable>} />
      <GlassPanel style={styles.inviteCard}><Pressable onPress={() => setQrExpanded(true)} accessibilityRole="button" accessibilityLabel="Expand friend invite QR code" style={styles.qrCode}><QRCode value={inviteUrl} size={82} color={palette.deep} backgroundColor="#FFFFFF" quietZone={5} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.inviteTitle, { color: palette.onSurface }]}>Grow your circle</Text><Text style={[styles.inviteText, { color: palette.onSurfaceVariant }]}>Friends can scan this QR or open the app-first invite URL. Tap the QR to enlarge it.</Text><Pressable onPress={shareInvite} accessibilityRole="button" accessibilityLabel="Share invite link" style={[styles.copyLink, { alignSelf: 'flex-start', minHeight: 40, paddingRight: 10, marginTop: 4 }]}><Ionicons name="link" size={15} color={palette.deep} /><Text style={[styles.copyLinkText, { color: palette.deep }]}>Share invite link</Text></Pressable></View></GlassPanel>
      <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Your friends</Text><Text style={[styles.sectionLink, { color: palette.deep }]}>{friendsLoading ? 'Loading…' : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`}</Text></View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.friendList}>
        {friendsLoading ? <DataStatePanel palette={palette} loading title="Loading your circle" detail="Bringing your friends and their mascots together." /> : friendsError ? <DataStatePanel palette={palette} title="Friends unavailable" detail={friendsError} actionLabel="Try again" onAction={() => void loadFriends()} /> : friends.length ? friends.map((friend) => <FriendRow key={friend.id} name={friend.name} mascot={friend.mascotName} accessories={friend.accessories} lifetimePoints={friend.lifetimePoints} palette={palette} onMore={() => Alert.alert(friend.name, `${friend.name} and ${friend.mascotName} have earned ${friend.lifetimePoints.toLocaleString()} lifetime leaves.`)} />) : <View style={[styles.friendEmpty, { backgroundColor: withAlpha(palette.surfaceBright, 0.7), borderColor: palette.outlineVariant }]}><View style={[styles.friendEmptyIcon, { backgroundColor: palette.primaryContainer }]}><Ionicons name="people-outline" size={24} color={palette.onPrimaryContainer} /></View><View style={styles.friendEmptyCopy}><Text style={[styles.friendEmptyTitle, { color: palette.onSurface }]}>Build habits together</Text><Text style={[styles.friendEmptyText, { color: palette.onSurfaceVariant }]}>Add friends to compare verified impact, invite each other to quests and celebrate streaks. Share the QR above to start.</Text></View></View>}
      </ScrollView><Modal visible={qrExpanded} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setQrExpanded(false)}><Pressable style={styles.qrModal} onPress={() => setQrExpanded(false)} accessibilityRole="button" accessibilityLabel="Close expanded QR code"><View style={styles.qrModalCard}><QRCode value={inviteUrl} size={260} color={palette.deep} backgroundColor="#FFFFFF" quietZone={12} /><Text style={[styles.qrModalTitle, { color: palette.onSurface }]}>Scan to open novo</Text><Text style={[styles.qrModalText, { color: palette.onSurfaceVariant }]}>The invite opens the novo app when installed, with the website as fallback.</Text></View></Pressable></Modal>
    </View>
  );
}

function FriendRow({ name, mascot, accessories, lifetimePoints, palette, onMore }: { name: string; mascot: string; accessories: AccessoryId[]; lifetimePoints: number; palette: Palette; onMore: () => void }) {
  const level = getLifetimeLevel(lifetimePoints);
  const friendScheme = createAccessoryColorScheme(accessories);
  const visibleAccessories = accessories.slice(0, 3);
  const remainingAccessories = Math.max(0, accessories.length - visibleAccessories.length);
  return <View style={[styles.friendRow, { minHeight: 96, backgroundColor: withAlpha(palette.surfaceBright, 0.76), borderColor: palette.outlineVariant }]}><View style={styles.friendInfo}><View style={[styles.friendAvatar, { backgroundColor: friendScheme.primaryContainer }]}><Text style={[styles.friendInitial, { color: friendScheme.onPrimaryContainer }]}>{name[0]?.toUpperCase() || '?'}</Text></View><View style={styles.friendCopy}><Text numberOfLines={1} style={[styles.friendName, { color: palette.onSurface }]}>{name}</Text><View style={styles.friendPlushieLine}><Text numberOfLines={1} style={[styles.friendPlushieName, { color: palette.onSurfaceVariant }]}>{mascot}</Text><View style={styles.friendAccessories}>{visibleAccessories.map((id) => { const badgeScheme = createAccessoryColorScheme([id]); return <View key={id} accessibilityLabel={ACCESSORIES.find((item) => item.id === id)?.name} style={[styles.friendBadge, { backgroundColor: badgeScheme.primaryContainer }]}><Ionicons name={accessoryIcon(id)} size={12} color={badgeScheme.onPrimaryContainer} /></View>; })}{remainingAccessories ? <View accessibilityLabel={`${remainingAccessories} more accessories`} style={[styles.friendBadge, { backgroundColor: palette.surfaceContainerHigh }]}><Text style={[styles.friendBadgeMore, { color: palette.onSurfaceVariant }]}>+{remainingAccessories}</Text></View> : null}</View></View><Text numberOfLines={1} style={[styles.friendProgress, { color: palette.onSurfaceVariant }]}>{lifetimePoints.toLocaleString()} lifetime leaves · Level {level.level}</Text></View></View><Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={`View ${name}'s details`} style={[styles.moreButton, { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surfaceContainerHigh }]}><Ionicons name="chevron-forward" size={18} color={palette.onSurface} /></Pressable></View>;
}

function SettingsPage({ user, palette, onUpdateProfile, onChangePassword, onLinkAccount, onUpdateNotifications, onSignOut, onUnpair, onDeleteAccount }: { user: User; palette: Palette; onUpdateProfile: (input: { name: string; username: string; avatarDataUrl?: string | null }) => Promise<User>; onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>; onLinkAccount: (provider: OAuthProvider) => Promise<User>; onUpdateNotifications: (preferences: User['notificationPreferences']) => Promise<void>; onSignOut: () => void; onUnpair: () => void; onDeleteAccount: () => void }) {
  const [showCredits, setShowCredits] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const confirmUnpair = () => Alert.alert('Unpair wristband?', `${user.mascotName} stays in-app, but the wristband must be paired again before Home can open.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Unpair', style: 'destructive', onPress: onUnpair }]);
  const confirmSignOut = () => Alert.alert('Sign out of novo?', 'Your progress is saved to your account and will be here when you return.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: onSignOut }]);
  const confirmDelete = () => Alert.alert('Delete account?', 'This permanently removes your novo account, points, mascot and digital accessory collection from every device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: onDeleteAccount }]);
  if (showCredits) return <CreditsPage onBack={() => setShowCredits(false)} />;
  if (showNotifications) return <NotificationSettingsPage preferences={user.notificationPreferences} palette={palette} onBack={() => setShowNotifications(false)} onSave={onUpdateNotifications} />;
  if (showProfile) return <ProfileSettingsPage user={user} palette={palette} onBack={() => setShowProfile(false)} onUpdateProfile={onUpdateProfile} onChangePassword={onChangePassword} onLinkAccount={onLinkAccount} />;
  return (
    <View style={styles.pagePad}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsPageContent}>
        <PageTitle eyebrow="MAKE IT YOURS" title="Settings" />
        <GlassPanel style={styles.profileCard}>{user.avatarDataUrl ? <Image source={{ uri: user.avatarDataUrl }} style={styles.profileAvatarImage} /> : <View style={[styles.profileAvatar, { backgroundColor: palette.primary }]}><Text style={[styles.profileInitial, { color: palette.onPrimary }]}>{user.name[0]?.toUpperCase() || '?'}</Text></View>}<View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.profileName, { color: palette.onSurface }]} numberOfLines={1}>{user.name}</Text><Text style={[styles.profileEmail, { color: palette.onSurfaceVariant }]} numberOfLines={1}>@{user.username} · {user.email}</Text></View><Pressable onPress={() => setShowProfile(true)} accessibilityRole="button" accessibilityLabel="Edit profile" style={[styles.editButton, { backgroundColor: palette.secondaryContainer }]}><Text style={[styles.editText, { color: palette.onSecondaryContainer }]}>Edit</Text></Pressable></GlassPanel>
        <View style={styles.settingsList}><Setting icon="person-circle-outline" label="Profile, password & linked accounts" onPress={() => setShowProfile(true)} /><Setting icon="notifications-outline" label="Notifications" onPress={() => setShowNotifications(true)} /><Setting icon="information-circle-outline" label="Credits" onPress={() => setShowCredits(true)} /><Setting icon="radio-outline" label="Unpair wristband" onPress={confirmUnpair} /></View>
        <View style={styles.accountActions}><Pressable onPress={confirmSignOut} accessibilityRole="button" accessibilityLabel="Sign out" accessibilityHint="Requires confirmation" style={({ pressed }) => [styles.signOutButton, { backgroundColor: palette.surfaceContainerLow }, pressed && styles.cardPressed]}><Ionicons name="log-out-outline" size={19} color={palette.onSurface} /><Text style={[styles.signOutText, { color: palette.onSurface }]}>Sign out</Text></Pressable><View style={[styles.dangerZone, { borderColor: palette.error }]}><Text style={[styles.dangerZoneLabel, { color: palette.error }]}>DANGER ZONE · PERMANENT</Text><Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="Delete account" accessibilityHint="Requires confirmation" style={({ pressed }) => [styles.deleteButton, { backgroundColor: palette.errorContainer }, pressed && styles.cardPressed]}><Ionicons name="trash-outline" size={19} color={palette.error} /><Text style={[styles.deleteText, { color: palette.error }]}>Delete account</Text></Pressable></View></View>
      </ScrollView>
    </View>
  );
}

function NotificationSettingsPage({ preferences, palette, onBack, onSave }: { preferences: User['notificationPreferences']; palette: Palette; onBack: () => void; onSave: (preferences: User['notificationPreferences']) => Promise<void> }) {
  const [value, setValue] = useState(preferences);
  const [busy, setBusy] = useState<keyof User['notificationPreferences'] | null>(null);
  const options: Array<{ key: keyof User['notificationPreferences']; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'dailyGreeting', title: 'Daily wristband tap', detail: 'Protect your streak and refresh the random quest board.', icon: 'radio-outline' },
    { key: 'tasks', title: 'Task reminders', detail: 'A gentle reminder before today’s tasks expire.', icon: 'checkmark-circle-outline' },
    { key: 'events', title: 'Events nearby', detail: 'Upcoming activities and registration reminders.', icon: 'calendar-outline' },
    { key: 'friends', title: 'Friend activity', detail: 'Invites and shared quest updates.', icon: 'people-outline' },
    { key: 'orders', title: 'Rewards and wristband', detail: 'Coupon updates and wristband collection reminders.', icon: 'bag-check-outline' },
  ];
  const toggle = async (key: keyof User['notificationPreferences']) => {
    if (busy) return;
    const next = { ...value, [key]: !value[key] };
    setValue(next); setBusy(key);
    try { await onSave(next); }
    catch (reason) { setValue(value); Alert.alert('Notifications not updated', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(null); }
  };
  return <View style={styles.pagePad}><View style={styles.creditsHeader}><Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={[styles.creditsBack, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}><Ionicons name="arrow-back" size={21} color={palette.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.pageEyebrow, { color: palette.deep }]}>REMINDERS</Text><Text style={[styles.pageTitle, { color: palette.onSurface }]}>Notifications</Text></View></View><Text style={[styles.creditsIntro, { color: palette.onSurfaceVariant }]}>Choose the moments when novo may gently bring you back to your wristband, mascot and community.</Text><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.creditsList}>{options.map((option) => { const enabled = value[option.key]; return <Pressable key={option.key} disabled={Boolean(busy)} onPress={() => void toggle(option.key)} accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: Boolean(busy) }} style={[styles.notificationRow, { backgroundColor: withAlpha(palette.surfaceBright, 0.74), borderColor: palette.outlineVariant }, busy && styles.controlBusy]}><View style={[styles.creditMark, { backgroundColor: enabled ? palette.primaryContainer : palette.surfaceContainerHigh }]}><Ionicons name={option.icon} size={20} color={enabled ? palette.onPrimaryContainer : palette.onSurfaceVariant} /></View><View style={styles.creditCopy}><Text style={[styles.creditName, { color: palette.onSurface }]}>{option.title}</Text><Text style={[styles.creditDetail, { color: palette.onSurfaceVariant }]}>{option.detail}</Text></View><View style={[styles.toggleTrack, { backgroundColor: enabled ? palette.deep : palette.surfaceContainerHigh }]}><View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} /></View></Pressable>; })}<Text style={[styles.creditsFootnote, { color: palette.onSurfaceVariant }]}>Your device permission and these preferences must both be enabled for reminders to appear.</Text></ScrollView></View>;
}

function CreditsPage({ onBack }: { onBack: () => void }) {
  const scheme = useDynamicScheme();
  return <View style={styles.pagePad}>
    <View style={styles.creditsHeader}><Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={[styles.creditsBack, { backgroundColor: scheme.surfaceContainerLow, borderColor: scheme.outlineVariant }]}><Ionicons name="arrow-back" size={21} color={scheme.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.pageEyebrow, { color: scheme.deep }]}>OPEN SOURCE</Text><Text style={[styles.pageTitle, { color: scheme.onSurface }]}>Credits</Text></View></View>
    <Text style={[styles.creditsIntro, { color: scheme.onSurfaceVariant }]}>novo is built with open-source software and open map data. Thank you to the people and communities who make these projects possible.</Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.creditsList}>
      {OPEN_SOURCE_CREDITS.map((credit) => <Pressable key={credit.name} onPress={() => void Linking.openURL(credit.url)} accessibilityRole="link" style={[styles.creditRow, { backgroundColor: withAlpha(scheme.surfaceBright, 0.74), borderColor: scheme.outlineVariant }]}><View style={[styles.creditMark, { backgroundColor: scheme.primaryContainer }]}><Ionicons name={credit.name === 'OpenStreetMap' ? 'map-outline' : 'code-slash-outline'} size={19} color={scheme.onPrimaryContainer} /></View><View style={styles.creditCopy}><Text style={[styles.creditName, { color: scheme.onSurface }]}>{credit.name}</Text><Text style={[styles.creditDetail, { color: scheme.onSurfaceVariant }]}>{credit.detail}</Text><Text style={[styles.creditLicense, { color: scheme.deep }]}>{credit.license}</Text></View><Ionicons name="open-outline" size={17} color={scheme.onSurfaceVariant} /></Pressable>)}
      <Text style={[styles.creditsFootnote, { color: scheme.onSurfaceVariant }]}>Individual copyright notices, map attribution and licence texts are available here from each project.</Text>
    </ScrollView>
  </View>;
}

function Setting({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) { const scheme = useDynamicScheme(); return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.settingRow, { backgroundColor: withAlpha(scheme.surfaceBright, 0.7), borderColor: scheme.outlineVariant }, pressed && styles.cardPressed]}><View style={[styles.settingIcon, { backgroundColor: scheme.secondaryContainer }]}><Ionicons name={icon} size={20} color={scheme.onSecondaryContainer} /></View><Text style={[styles.settingLabel, { color: scheme.onSurface }]}>{label}</Text><Ionicons name="chevron-forward" size={18} color={scheme.onSurfaceVariant} /></Pressable>; }
function PageTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) { const scheme = useDynamicScheme(); return <View style={styles.pageTitleRow}><View><Text style={[styles.pageEyebrow, { color: scheme.deep }]}>{eyebrow}</Text><Text style={[styles.pageTitle, { color: scheme.onSurface }]}>{title}</Text></View>{right}</View>; }

function GlassPanel({ children, style }: { children: ReactNode; style?: object }) { const scheme = useDynamicScheme(); return <View style={[styles.glassBorder, { borderColor: scheme.outlineVariant, backgroundColor: withAlpha(scheme.surfaceContainerLow, 0.64) }, style]}><BlurView intensity={72} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', backgroundColor: withAlpha(scheme.surfaceBright, 0.16) }]} /><>{children}</></View>; }

function GlassNav({ active, palette, onChange }: { active: Tab; palette: Palette; onChange: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; cta?: boolean }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' }, { id: 'marketplace', label: 'Market', icon: 'bag-handle-outline' }, { id: 'tasks', label: 'Tasks', icon: 'map-outline', cta: true }, { id: 'friends', label: 'Friends', icon: 'people-outline' }, { id: 'settings', label: 'Settings', icon: 'settings-outline' },
  ];
  return (
    <View style={styles.navWrap}>
      <View style={styles.navShadow}>
        <View style={[styles.navClip, { backgroundColor: withAlpha(palette.surfaceContainer, 0.82), borderColor: withAlpha(palette.surfaceBright, 0.9) }]}>
          <BlurView intensity={82} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />
          <View style={styles.navRow}>
            {items.map((item) => { const selected = active === item.id; const activeContainer = item.cta ? palette.deep : palette.primary; return <Pressable key={item.id} onPress={() => onChange(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.navItem, selected && { backgroundColor: item.cta ? withAlpha(palette.deep, 0.12) : palette.primaryContainer }]}><View style={[styles.navIconWrap, selected && { backgroundColor: activeContainer }, item.cta && !selected && { backgroundColor: palette.secondaryContainer }]}><Ionicons name={selected ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon} size={21} color={selected ? (item.cta ? '#FFFFFF' : palette.onPrimary) : item.cta ? palette.onSecondaryContainer : palette.onSurfaceVariant} /></View><Text style={[styles.navText, { color: selected ? palette.onSurface : palette.onSurfaceVariant, fontSize: 11, fontWeight: selected ? '800' : '700' }]}>{item.label}</Text></Pressable>; })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' }, shell: { position: 'relative', flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', overflow: 'hidden' }, body: { flex: 1, overflow: 'visible' },
  header: { height: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  homePage: { position: 'relative', flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 96, overflow: 'visible' }, homeGlowBackdrop: { position: 'absolute', zIndex: 0, top: -76, left: -40, right: -40, bottom: -104, overflow: 'visible' }, homeCelebration: { ...StyleSheet.absoluteFillObject, zIndex: 100, overflow: 'hidden' }, homeOverview: { position: 'relative', zIndex: 3, width: '100%', maxWidth: 540, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, greetingBlock: { flex: 1 }, hello: { color: colors.ink, fontSize: 19, lineHeight: 24, fontWeight: '700' }, helloSub: { color: colors.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }, homeStats: { flexDirection: 'row', alignItems: 'center', gap: 8 }, streakPill: { minWidth: 48, minHeight: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, pointsPill: { minWidth: 66, minHeight: 44, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, statEmoji: { fontSize: 16 }, statNumber: { color: colors.ink, fontSize: 14, fontWeight: '700' }, dailyTap: { width: '100%', minHeight: 74, marginBottom: 10, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', overflow: 'hidden' }, dailyTapIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.76)', alignItems: 'center', justifyContent: 'center' }, dailyTapEyebrow: { color: colors.inkMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8, marginBottom: 1 }, dailyTapTitle: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '900' }, dailyTapText: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, nfcReadyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest, shadowColor: colors.forest, shadowOpacity: 0.34, shadowRadius: 6 },
  lifetimeCard: { position: 'relative', zIndex: 3, width: '100%', maxWidth: 540, minHeight: 76, marginTop: 8, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, lifetimeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lifetimeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 }, lifetimeIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, lifetimeTitle: { color: colors.inkMuted, fontSize: 12, lineHeight: 15, fontWeight: '600' }, lifetimeTotal: { color: colors.ink, fontSize: 16, lineHeight: 19, fontWeight: '700' }, levelPill: { minHeight: 28, borderRadius: 99, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, levelText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, levelTrack: { width: '100%', height: 6, borderRadius: 99, marginTop: 7, backgroundColor: 'rgba(23,53,42,0.09)', overflow: 'hidden' }, levelFill: { height: '100%', borderRadius: 99 }, levelFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }, levelProgress: { color: colors.ink, fontSize: 11, fontWeight: '600' }, levelNext: { color: colors.inkMuted, fontSize: 11 },
  sceneArea: { position: 'relative', zIndex: 1, flex: 1, width: '100%', minHeight: 220, marginTop: 10, marginBottom: 2, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, glowCanvas: { position: 'absolute', zIndex: 0, top: '-23%', right: '-23%', bottom: '-23%', left: '-23%', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, rotationHint: { position: 'absolute', zIndex: 2, bottom: 8, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.88)', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99 }, rotationText: { color: colors.inkMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.1 }, homeBottom: { position: 'relative', zIndex: 3, width: '100%', maxWidth: 560, paddingTop: 3 }, plushieIdentity: { alignItems: 'center', paddingTop: 4, paddingBottom: 12 }, plushieName: { color: '#101512', fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: -0.7 }, plushieType: { color: colors.inkMuted, fontSize: 14, lineHeight: 19, marginTop: 2 },
  homeActions: { width: '100%', maxWidth: 540, flexDirection: 'row', gap: 10, marginTop: 3 }, homeActionPrimary: { flex: 1, minHeight: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, homeActionPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, stackBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }, stackBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, homeActionSecondary: { minWidth: 116, minHeight: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, homeActionSecondaryText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  glassBorder: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)', backgroundColor: 'rgba(255,255,255,0.48)' }, closet: { width: '100%', maxWidth: 560, height: 218, borderRadius: 22, padding: 10 }, closetTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 }, closetTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' }, closetHint: { color: colors.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 1 }, miniClose: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }, categoryScroller: { flexGrow: 0, marginTop: 5, marginHorizontal: -2, overflow: 'hidden' }, categoryList: { gap: 6, paddingHorizontal: 2 }, categoryChip: { minHeight: 36, borderRadius: 99, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', overflow: 'hidden' }, categoryChipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' }, categoryChipTextActive: { color: '#FFFFFF', fontWeight: '700' }, accessoryScroller: { flexGrow: 0, marginTop: 8, marginHorizontal: -2, overflow: 'hidden' }, accessoryList: { gap: 7, paddingHorizontal: 2, paddingBottom: 2 }, accessoryCard: { width: 164, height: 100, borderRadius: 16, padding: 9, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' }, accessoryCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 27 }, accessoryIconBubble: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.62)' }, accessoryChipActive: { borderColor: colors.forest }, accessoryChipText: { color: colors.ink, fontSize: 12, lineHeight: 15, fontWeight: '700', marginTop: 4 }, accessoryMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 5 }, accessoryCategory: { flex: 1, color: colors.inkMuted, fontSize: 10 }, rarityPill: { minHeight: 20, borderRadius: 99, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }, rarityText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.1 }, locked: { opacity: 0.42 },
  pagePad: { flex: 1, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 0, gap: 12 }, pageTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pageEyebrow: { color: colors.purple, fontSize: 12, fontWeight: '900', letterSpacing: 1.15 }, pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -1 }, balance: { minHeight: 42, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }, balanceText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  marketTabs: { minHeight: 46, padding: 4, borderRadius: 17, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.62)', flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, marketTab: { flex: 1, minHeight: 38, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, marketTabText: { color: colors.inkMuted, backgroundColor: 'transparent', fontSize: 14, fontWeight: '700' }, marketTabTextActive: { color: '#FFFFFF' }, marketScroll: { gap: 14, paddingBottom: 20 }, marketHero: { minHeight: 124, borderRadius: 25, padding: 19, overflow: 'hidden', justifyContent: 'center' }, marketOrb: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)', right: -18, top: -40 }, marketEyebrow: { color: '#E7F59E', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, marketTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 6 }, marketText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18, marginTop: 4 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, sectionLink: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' }, catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, catalogCard: { width: '48%', flexGrow: 1, minHeight: 224, borderRadius: 22, padding: 9, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, cardPressed: { opacity: 0.76, transform: [{ scale: 0.985 }] }, catalogPreview: { height: 122, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, catalogRarity: { position: 'absolute', top: 8, right: 8, minHeight: 21, borderRadius: 99, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }, catalogInfo: { flex: 1, minHeight: 82, marginTop: 8, gap: 8, justifyContent: 'space-between' }, catalogCopy: { flex: 1, minWidth: 0 }, catalogName: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '800' }, catalogCategory: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, catalogPrice: { width: '100%', minHeight: 36, borderRadius: 12, paddingHorizontal: 8, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, catalogOwned: { backgroundColor: '#EEF2EC' }, catalogBuyText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, charityList: { gap: 9 }, charityCard: { minHeight: 82, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10 }, charityIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, charityTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, charityText: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, charityPrice: { minHeight: 32, borderRadius: 11, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }, donateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  modalScrim: { backgroundColor: 'rgba(12,19,16,0.48)' }, checkoutModal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' }, checkoutSheet: { width: '100%', maxWidth: 680, maxHeight: '94%', minHeight: 420, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 13, paddingHorizontal: 18, paddingBottom: 24, backgroundColor: '#FCFDF9', overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 24 }, checkoutClose: { position: 'absolute', top: 18, right: 18, width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 20 }, checkoutContent: { paddingTop: 9, paddingBottom: 6, gap: 13 }, tryOnStage: { height: 245, borderRadius: 25, overflow: 'hidden', alignItems: 'center' }, tryOnLabel: { position: 'absolute', left: 12, top: 12, minHeight: 30, borderRadius: 99, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.84)', flexDirection: 'row', alignItems: 'center', gap: 5 }, tryOnLabelText: { fontSize: 11, fontWeight: '800' }, checkoutHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, checkoutEyebrow: { color: colors.purple, fontSize: 11, fontWeight: '900', letterSpacing: 0.85 }, checkoutTitle: { color: colors.ink, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7, marginTop: 2 }, checkoutPrice: { minWidth: 72, minHeight: 42, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, checkoutPriceText: { color: colors.ink, fontSize: 14, fontWeight: '900' }, checkoutDescription: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 7 }, lockerSelect: { minHeight: 54, borderRadius: 17, paddingHorizontal: 13, backgroundColor: '#F0F3ED', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 9 }, lockerSelectOpen: { borderColor: colors.outline, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }, lockerSelectText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }, lockerPlaceholder: { color: colors.inkMuted, fontWeight: '500' }, lockerMenu: { marginTop: 5, borderRadius: 17, padding: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(23,53,42,0.1)', overflow: 'hidden' }, lockerOption: { minHeight: 48, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }, lockerOptionText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, lockerAddress: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 }, checkoutNotice: { minHeight: 46, borderRadius: 15, paddingHorizontal: 11, backgroundColor: '#EEF3EB', flexDirection: 'row', alignItems: 'center', gap: 8 }, checkoutNoticeText: { flex: 1, color: colors.inkMuted, fontSize: 12, lineHeight: 17 }, confirmSlider: { width: '100%', height: 58, borderRadius: 19, padding: 4, backgroundColor: '#E6EAE4', justifyContent: 'center', overflow: 'hidden' }, confirmSliderDisabled: { opacity: 0.48 }, confirmSliderText: { color: colors.inkMuted, fontSize: 13, fontWeight: '800', textAlign: 'center', paddingLeft: 48 }, confirmKnob: { position: 'absolute', left: 4, width: 54, height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 }, sliderHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' }, charityCheckout: { paddingTop: 35, paddingBottom: 8, gap: 14, alignItems: 'center' }, charityHeroIcon: { width: 92, height: 92, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, charityDescription: { textAlign: 'center', maxWidth: 500 }, impactRow: { width: '100%', flexDirection: 'row', gap: 7, marginVertical: 6 }, impactPill: { flex: 1, minHeight: 45, borderRadius: 15, backgroundColor: '#F0F3ED', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, impactPillText: { color: colors.ink, fontSize: 11, fontWeight: '700' }, successPane: { minHeight: 440, paddingTop: 78, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, successIcon: { width: 82, height: 82, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, successTitle: { color: colors.ink, fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 18 }, successText: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 430, marginTop: 8 }, doneButton: { width: '100%', minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 26 }, doneButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, confettiLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' }, confettiPiece: { position: 'absolute', width: 8, height: 14, borderRadius: 3 },
  mapPage: { flex: 1, overflow: 'hidden' }, mapTopFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 122 }, mapControls: { position: 'absolute', top: 14, left: 14, right: 14, gap: 9, alignItems: 'center' }, tasksErrorBanner: { position: 'absolute', top: 122, left: 16, right: 16, zIndex: 4, minHeight: 48, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, tasksControlRow: { width: '100%', maxWidth: 500, flexDirection: 'row', alignItems: 'center', gap: 8 }, mapTitle: { color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '900', letterSpacing: -1 }, locateButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(240,244,238,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, overflow: 'hidden' }, tasksTabs: { flex: 1, minHeight: 48, padding: 4, borderRadius: 20, backgroundColor: 'rgba(233,239,231,0.92)', flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: 'rgba(23,53,42,0.08)', shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5, overflow: 'hidden' }, tasksTab: { flex: 1, minHeight: 38, borderRadius: 15, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'transparent' }, tasksTabText: { color: colors.inkMuted, backgroundColor: 'transparent', fontSize: 14, fontWeight: '800' }, tasksTabTextActive: { color: '#FFFFFF', backgroundColor: 'transparent' }, mapLegend: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(238,243,236,0.92)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(23,53,42,0.06)' }, legendDot: { width: 9, height: 9, borderRadius: 99 }, legendSquare: { width: 9, height: 9, borderRadius: 3 }, legendText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800', marginRight: 2 }, taskSheet: { position: 'absolute', left: 13, right: 13, bottom: 96, height: 196, borderRadius: 28, padding: 14, gap: 9 }, sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CFD3CC', alignSelf: 'center', marginTop: -5 }, taskSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, taskSheetTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, taskSheetSub: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, questCount: { minWidth: 30, height: 30, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, questCountText: { color: colors.ink, fontSize: 12, fontWeight: '900' }, questBoard: { gap: 8, paddingRight: 4 }, questCard: { minHeight: 106, borderRadius: 20, padding: 12, backgroundColor: 'rgba(250,252,249,0.92)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', overflow: 'hidden' }, completedTask: { opacity: 0.58 }, questCardCompact: { width: 246, minHeight: 106 }, questCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, questPoints: { minHeight: 25, borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#E8F3E8', flexDirection: 'row', alignItems: 'center', gap: 3 }, questPointsText: { color: colors.forest, fontSize: 11, fontWeight: '900' }, questSource: { maxWidth: 128, minHeight: 25, borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#F0EBFF', flexDirection: 'row', alignItems: 'center', gap: 4 }, questSourceText: { flexShrink: 1, color: colors.purple, fontSize: 10, fontWeight: '800' }, questTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 8 }, questDescription: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, tasksListPage: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', paddingTop: 20, paddingHorizontal: 16, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', backgroundColor: 'rgba(247,250,245,0.97)', borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.9)' }, tasksListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, taskPanelTitle: { color: colors.ink, fontSize: 25, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6 }, tasksScroll: { gap: 12, paddingBottom: 112 }, taskSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }, taskSectionSub: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, dailyQuestList: { gap: 8 }, eventList: { gap: 8 }, eventCard: { minHeight: 90, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }, eventBadge: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, eventBadgePoints: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, eventBadgeLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 8, fontWeight: '900' }, eventStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, eventStatusDot: { width: 7, height: 7, borderRadius: 99 }, eventStatusText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' }, eventTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 4 }, eventMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, submissionCard: { minHeight: 66, borderRadius: 19, padding: 9, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden' }, submissionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, livePill: { minHeight: 30, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }, liveText: { color: colors.ink, fontSize: 11, fontWeight: '900' }, nearbyTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, nearbyMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, distance: { color: colors.forest, fontSize: 11, fontWeight: '900' }, taskModal: { flex: 1, justifyContent: 'flex-end' }, taskComposer: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, paddingBottom: 30, gap: 12, borderTopLeftRadius: 31, borderTopRightRadius: 31, backgroundColor: '#FCFDF9', overflow: 'hidden' }, taskComposerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, taskComposerTitle: { color: colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', marginTop: 3 }, taskInput: { minHeight: 52, borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#EFF2EC', color: colors.ink, fontFamily: 'GoogleSansFlex', fontSize: 15 }, taskDescription: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' }, photoEvidence: { height: 135, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E8EEE5', alignItems: 'center', justifyContent: 'center', gap: 7 }, photoEvidenceText: { color: colors.ink, fontSize: 13, fontWeight: '800' }, aiNotice: { minHeight: 54, borderRadius: 17, padding: 11, backgroundColor: '#F2EDFF', flexDirection: 'row', alignItems: 'center', gap: 9 }, aiNoticeText: { flex: 1, color: colors.inkMuted, fontSize: 11, lineHeight: 16 }, taskFormMessage: { minHeight: 42, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, taskFormMessageText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700' }, taskSubmit: { minHeight: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' }, taskSubmitNeedsInput: { opacity: 0.72 }, taskSubmitText: { color: '#FFFFFF', backgroundColor: 'transparent', fontSize: 15, fontWeight: '900' }, eventDetailSheet: { width: '100%', maxWidth: 680, alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', backgroundColor: '#FCFDF9' }, eventDetailHero: { position: 'relative', minHeight: 116, paddingHorizontal: 20, paddingTop: 30, paddingBottom: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, eventSheetHandle: { position: 'absolute', top: 10, left: '50%', width: 38, height: 4, marginLeft: -19, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.72)' }, eventDetailEyebrow: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, eventDetailPoints: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, eventDetailContent: { padding: 20, paddingBottom: 30, gap: 14 }, eventDetailTitle: { color: colors.ink, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7 }, eventDetailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, eventDetailMeta: { flex: 1, color: colors.inkMuted, fontSize: 14, lineHeight: 20 }, emptyState: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 22 },
  roundButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, inviteCard: { minHeight: 134, borderRadius: 27, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 14 }, qrCode: { width: 94, height: 94, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, inviteTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, inviteText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }, copyLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }, copyLinkText: { fontSize: 12, fontWeight: '900' }, friendList: { gap: 8, paddingBottom: 104 }, friendEmpty: { minHeight: 74, borderRadius: 21, padding: 11, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 11 }, friendEmptyIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, friendEmptyCopy: { flex: 1, minWidth: 0 }, friendEmptyTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' }, friendEmptyText: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, friendRow: { minHeight: 92, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, friendInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }, friendAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, friendInitial: { color: colors.ink, fontSize: 18, fontWeight: '900' }, friendCopy: { flex: 1, minWidth: 0 }, friendName: { color: colors.ink, fontSize: 14, fontWeight: '900' }, friendPlushieLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, friendPlushieName: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' }, friendAccessories: { flexDirection: 'row', gap: 3 }, friendBadge: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, friendProgress: { color: colors.inkMuted, fontSize: 10, marginTop: 5 }, friendActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, questButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, moreButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(230,234,226,0.8)', alignItems: 'center', justifyContent: 'center' },
  settingsPageContent: { gap: 12, paddingBottom: 104 }, profileCard: { minHeight: 92, borderRadius: 25, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, profileAvatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: colors.ink, fontSize: 20, fontWeight: '900' }, profileName: { color: colors.ink, fontSize: 16, fontWeight: '900' }, profileEmail: { color: colors.inkMuted, fontSize: 12, marginTop: 3 }, editButton: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.58)', alignItems: 'center', justifyContent: 'center' }, editText: { fontSize: 11, fontWeight: '900' }, settingsList: { gap: 7 }, settingRow: { minHeight: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.62)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }, settingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(230,234,226,0.7)', alignItems: 'center', justifyContent: 'center' }, settingLabel: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '900' }, accountActions: { gap: 20, marginTop: 8 }, signOutButton: { width: '100%', minHeight: 50, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.68)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, signOutText: { color: colors.ink, fontSize: 14, fontWeight: '900' }, dangerZone: { borderTopWidth: 1, paddingTop: 14, gap: 8 }, dangerZoneLabel: { fontSize: 10, fontWeight: '900', letterSpacing: .8 }, deleteButton: { width: '100%', minHeight: 50, borderRadius: 17, backgroundColor: '#FFE9E6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, deleteText: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  creditsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 }, creditsBack: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, creditsIntro: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: -2 }, creditsList: { gap: 8, paddingBottom: 104 }, creditRow: { minHeight: 84, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, notificationRow: { minHeight: 78, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, toggleTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: '#D7DDD5' }, toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 3 }, toggleKnobOn: { transform: [{ translateX: 20 }] }, creditMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(223,252,140,0.48)' }, creditCopy: { flex: 1, minWidth: 0 }, creditName: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' }, creditDetail: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, creditLicense: { color: colors.forest, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 3 }, creditsFootnote: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, paddingTop: 8 },
  lockerSearch: { minHeight: 46, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockerSearchInput: { flex: 1, minWidth: 0, paddingVertical: 9, fontFamily: 'GoogleSansFlex', fontSize: 14 },
  lockerResultCount: { paddingHorizontal: 5, paddingTop: 8, paddingBottom: 4, fontSize: 10, fontWeight: '700' },
  lockerResults: { maxHeight: 260 },
  lockerResultsContent: { paddingBottom: 3 },
  lockerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockerProvider: { overflow: 'hidden', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  lockerEmpty: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 7 },
  lockerEmptyText: { fontSize: 12, fontWeight: '700' },
  weeklyCard: { minHeight: 150, borderRadius: 24, padding: 16, overflow: 'hidden' },
  weeklyTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weeklyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E5FA86', alignItems: 'center', justifyContent: 'center' },
  weeklyEyebrow: { color: '#E5FA86', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  weeklyTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 23, fontWeight: '900', marginTop: 2 },
  weeklyDescription: { color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 17, marginTop: 11 },
  weeklyMeta: { alignSelf: 'flex-start', minHeight: 28, borderRadius: 99, marginTop: 11, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  weeklyMetaText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  weeklySheet: { width: '100%', maxWidth: 680, maxHeight: '92%', alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  weeklySheetContent: { padding: 20, paddingBottom: 34, gap: 16 },
  weeklyTimer: { minHeight: 40, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  weeklyQuestion: { gap: 7 },
  weeklyPrompt: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  weeklyOption: { minHeight: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, justifyContent: 'center' },
  weeklyResult: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, padding: 20 },
  weeklyResultTitle: { fontSize: 28, fontWeight: '900' },
  weeklyResultText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  weeklyLeader: { minHeight: 50, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  weeklyRank: { width: 34, fontWeight: '900' },
  weeklyLeaderName: { flex: 1, fontWeight: '800' },
  weeklyLeaderTime: { fontWeight: '700' },
  profileAvatarImage: { width: 54, height: 54, borderRadius: 19 },
  qrModal: { flex: 1, backgroundColor: 'rgba(8,18,14,.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrModalCard: { width: '100%', maxWidth: 340, borderRadius: 28, backgroundColor: '#FFFFFF', padding: 22, alignItems: 'center', gap: 9 },
  qrModalTitle: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  qrModalText: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  celebrationMessage: { position: 'absolute', top: 18, alignSelf: 'center', minHeight: 42, borderRadius: 99, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  celebrationMessageText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  personalImpactStrip: { position: 'relative', zIndex: 3, width: '100%', maxWidth: 540, minHeight: 52, marginTop: 7, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  personalImpactIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  personalImpactLabel: { fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  personalImpactValue: { fontSize: 13, lineHeight: 17, fontWeight: '800', marginTop: 1 },
  impactShareCard: { minHeight: 226, borderRadius: 26, padding: 18, gap: 14, overflow: 'hidden' },
  impactShareHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  impactShareEyebrow: { color: '#DFF77A', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  impactShareTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontWeight: '900', marginTop: 4 },
  impactMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  impactMetric: { width: '48%', flexGrow: 1, minHeight: 68, borderRadius: 17, padding: 10, backgroundColor: 'rgba(255,255,255,.12)' },
  impactMetricValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 4 },
  impactMetricLabel: { color: 'rgba(255,255,255,.72)', fontSize: 10, fontWeight: '700', marginTop: 1 },
  impactMethod: { color: 'rgba(255,255,255,.66)', fontSize: 9, lineHeight: 13 },
  shareImpactButton: { minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  shareImpactText: { fontSize: 14, fontWeight: '900' },
  impactHistoryRow: { flexDirection: 'row', gap: 7 },
  impactHistoryCard: { flex: 1, minHeight: 62, borderRadius: 17, padding: 9, backgroundColor: 'rgba(255,255,255,.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,.08)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  impactHistoryLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '800' },
  impactHistoryValue: { color: colors.ink, fontSize: 10, lineHeight: 14, fontWeight: '900', marginTop: 1 },
  marketLocked: { opacity: .52 },
  dataState: { minHeight: 88, borderRadius: 22, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  dataStateIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dataStateCopy: { flex: 1, minWidth: 0 },
  dataStateTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  dataStateDetail: { marginTop: 2, fontSize: 11, lineHeight: 16 },
  dataStateAction: { minHeight: 42, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  dataStateActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  friendBadgeMore: { fontSize: 9, fontWeight: '900' },
  controlBusy: { opacity: 0.6 },
  navWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 86, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, zIndex: 20 }, navShadow: { flex: 1, borderRadius: 26, shadowColor: colors.shadow, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10, backgroundColor: 'transparent' }, navClip: { flex: 1, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)', backgroundColor: 'rgba(233,239,231,0.78)' }, navRow: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 3, gap: 2 }, navItem: { flex: 1, minHeight: 62, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: 'transparent' }, navIconWrap: { width: 44, height: 31, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, navText: { color: colors.inkMuted, backgroundColor: 'transparent', fontSize: 10, fontWeight: '600' }, navTextActive: { color: colors.ink, backgroundColor: 'transparent', fontWeight: '800' },
});
