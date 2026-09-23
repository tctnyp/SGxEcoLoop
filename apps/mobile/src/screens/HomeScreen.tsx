import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, DimensionValue, Easing, Image, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
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
import { colors } from '../theme';
import { AccessoryCategory, AccessoryId, AccessoryRarity, Friend, NovoEvent, NovoLocation, TaskSubmission, User } from '../types';
import { getFriends, getLocations, getMarketLockers, getMemberTasks, signUpForEvent, submitCustomTask, submitDailyTask } from '../api';
import { startNovoPlushieListener } from '../nfc';

type Tab = 'home' | 'marketplace' | 'tasks' | 'friends' | 'settings';
type AccessoryFilter = 'all' | AccessoryCategory;
type Palette = { primary: string; secondary: string; soft: string; deep: string; glow: string };
type Props = {
  user: User;
  token: string;
  onSignOut: () => void;
  onUnpair: () => void;
  onDeleteAccount: () => void;
  onScanAccessory: () => void;
  onPlushieTag: (tagToken: string) => Promise<User>;
  onToggleAccessory: (id: AccessoryId) => void;
  onPurchase: (id: AccessoryId, cost: number, lockerLocation: string) => Promise<void>;
  onContribute: (points: number, causeId: string, causeName: string) => Promise<void>;
  onUpdateNotificationPreferences: (preferences: User['notificationPreferences']) => Promise<void>;
  onUserUpdated: (user: User) => Promise<void>;
};

type AccessoryOffer = { id: AccessoryId; price: number; description: string };
type CharityOffer = { id: string; name: string; detail: string; description: string; icon: keyof typeof Ionicons.glyphMap; points: number };
type MarketSelection = { kind: 'accessory'; offer: AccessoryOffer } | { kind: 'charity'; charity: CharityOffer };

const accessoryPalettes: Record<AccessoryId, Palette> = {
  'bright-star': { primary: '#F5E94B', secondary: '#F3D95C', soft: '#FFFDEA', deep: '#3D3A12', glow: '#F8F15A' },
  'sunny-cap': { primary: '#FF9B55', secondary: '#F7BD4B', soft: '#FFF4E7', deep: '#5F3517', glow: '#FFAF61' },
  'petal-pin': { primary: '#FF8178', secondary: '#E94C86', soft: '#FFF0F3', deep: '#773345', glow: '#FFFB5B' },
  'trail-scarf': { primary: '#8C78D5', secondary: '#5D91DB', soft: '#F2EEFF', deep: '#453778', glow: '#D8CAFF' },
  'cloud-mitts': { primary: '#6FD3BC', secondary: '#4DAF9C', soft: '#ECFBF7', deep: '#1D574E', glow: '#9CEAD7' },
  'meadow-socks': { primary: '#78C977', secondary: '#A4D968', soft: '#F0FAEC', deep: '#2D5B2C', glow: '#A8E7A5' },
  'tide-loop': { primary: '#55C4D8', secondary: '#5E92E8', soft: '#EBFAFD', deep: '#1E5265', glow: '#8CE4EE' },
};
const defaultPalette: Palette = { primary: '#DAF154', secondary: '#C5D7CF', soft: '#FBFDEB', deep: '#17352A', glow: '#F4FF39' };

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
  { name: 'Three.js & React Three Fiber', detail: '3D plushie and accessory rendering', license: 'MIT License', url: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'Ionicons', detail: 'Interface iconography', license: 'MIT License', url: 'https://github.com/ionic-team/ionicons' },
  { name: 'react-native-nfc-manager', detail: 'NFC pairing and plushie interaction', license: 'MIT License', url: 'https://github.com/revtel/react-native-nfc-manager' },
  { name: 'react-native-qrcode-svg', detail: 'Friend and accessory QR codes', license: 'MIT License', url: 'https://github.com/Expensify/react-native-qrcode-svg' },
  { name: 'React Native WebView', detail: 'Native map presentation', license: 'MIT License', url: 'https://github.com/react-native-webview/react-native-webview' },
  { name: 'Express, SQLite & Zod', detail: 'API, persistent storage and validation', license: 'Open-source software', url: 'https://github.com/expressjs/express' },
] as const;

export function HomeScreen(props: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [nfcStatus, setNfcStatus] = useState<'starting' | 'ready' | 'reading' | 'error' | 'web'>('starting');
  const [nfcMessage, setNfcMessage] = useState('');
  const [celebrationKey, setCelebrationKey] = useState(0);
  const interactionRef = useRef(props.onPlushieTag);
  const interactionBusyRef = useRef(false);
  const palette = useMemo(() => mergePalette(props.user.equippedAccessories), [props.user.equippedAccessories]);

  useEffect(() => { interactionRef.current = props.onPlushieTag; }, [props.onPlushieTag]);
  useEffect(() => {
    if (tab !== 'home') return undefined;
    if (Platform.OS === 'web') {
      setNfcStatus('web');
      setNfcMessage('Use the installed novo app to greet your plushie with NFC.');
      return undefined;
    }
    let disposed = false;
    let stopListening: (() => Promise<void>) | undefined;
    setNfcStatus('starting');
    setNfcMessage('');
    startNovoPlushieListener((tagToken) => {
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
        setNfcMessage(reason instanceof Error ? reason.message : 'That is not the plushie paired to this account.');
      }).finally(() => { interactionBusyRef.current = false; });
    }, () => {
      if (!disposed) {
        setNfcStatus('error');
        setNfcMessage('That NFC tag is not a prepared novo plushie tag.');
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
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#FDFEFC', blendWithWhite(palette.primary, 0.89), blendWithWhite(palette.secondary, 0.91)]} locations={[0, 0.56, 1]} style={[styles.shell, Platform.OS === 'web' && ({ overflow: 'clip' } as never)]}>
        <GridBackground color={blendWithWhite(palette.deep, 0.45)} opacity={0.17} />
        {tab !== 'tasks' && <AppHeader />}
        <View style={styles.body}>
          {tab === 'home' && <HomePage user={props.user} palette={palette} nfcStatus={nfcStatus} nfcMessage={nfcMessage} celebrationKey={celebrationKey} onScanAccessory={props.onScanAccessory} onToggleAccessory={props.onToggleAccessory} />}
          {tab === 'marketplace' && <MarketplacePage user={props.user} token={props.token} palette={palette} onPurchase={props.onPurchase} onContribute={props.onContribute} />}
          {tab === 'tasks' && <TasksPage token={props.token} palette={palette} onUserUpdated={props.onUserUpdated} />}
          {tab === 'friends' && <FriendsPage user={props.user} token={props.token} palette={palette} />}
          {tab === 'settings' && <SettingsPage user={props.user} palette={palette} onUpdateNotifications={props.onUpdateNotificationPreferences} onSignOut={props.onSignOut} onUnpair={props.onUnpair} onDeleteAccount={props.onDeleteAccount} />}
        </View>
        <GlassNav active={tab} palette={palette} onChange={changeTab} />
      </LinearGradient>
    </SafeAreaView>
  );
}

function mergePalette(ids: AccessoryId[]): Palette {
  if (!ids.length) return defaultPalette;
  const first = accessoryPalettes[ids[0] ?? 'petal-pin'];
  const last = accessoryPalettes[ids[ids.length - 1] ?? ids[0] ?? 'petal-pin'];
  return { primary: first.primary, secondary: last.secondary, soft: first.soft, deep: last.deep, glow: ids.length > 1 ? '#F1FF60' : first.glow };
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

function HomePage({ user, palette, nfcStatus, nfcMessage, celebrationKey, onScanAccessory, onToggleAccessory }: { user: User; palette: Palette; nfcStatus: 'starting' | 'ready' | 'reading' | 'error' | 'web'; nfcMessage: string; celebrationKey: number; onScanAccessory: () => void; onToggleAccessory: (id: AccessoryId) => void }) {
  const [showCloset, setShowCloset] = useState(false);
  const [manualRotation, setManualRotation] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const manualRotationRef = useRef(0);
  const rotationStartRef = useRef(0);
  const [accessoryFilter, setAccessoryFilter] = useState<AccessoryFilter>('all');
  const reduceMotion = useReduceMotionPreference();
  const level = useMemo(() => getLifetimeLevel(user.lifetimePoints), [user.lifetimePoints]);
  const visibleAccessories = useMemo(
    () => ACCESSORIES
      .filter((item) => accessoryFilter === 'all' || item.category === accessoryFilter)
      .sort((left, right) => rarityRank[right.rarity] - rarityRank[left.rarity] || left.name.localeCompare(right.name)),
    [accessoryFilter],
  );
  const rotationPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 2,
    onPanResponderGrant: () => {
      rotationStartRef.current = manualRotationRef.current;
      setIsInteracting(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const nextRotation = rotationStartRef.current + gesture.dx * 0.012;
      manualRotationRef.current = nextRotation;
      setManualRotation(nextRotation);
    },
    onPanResponderRelease: () => setIsInteracting(false),
    onPanResponderTerminate: () => setIsInteracting(false),
  }), []);
  const progressWidth = `${Math.max(4, Math.round(level.progress * 100))}%` as DimensionValue;
  const dailyGreetingDue = !scannedToday(user.lastPlushieScanAt);
  const firstGreeting = !user.lastPlushieScanAt;
  const dailyInteractionCopy = nfcStatus === 'reading' ? `Saying hello to ${user.plushieName}…` : nfcStatus === 'starting' ? 'Getting NFC ready…' : nfcStatus === 'ready' ? 'NFC is ready—bring your phone near the novo patch.' : nfcMessage;

  return (
    <View style={[styles.homePage, showCloset && { paddingBottom: 92 }]}>
      <View pointerEvents="none" style={styles.homeGlowBackdrop}><AccessoryGlow accessories={user.equippedAccessories} /></View>
      {celebrationKey > 0 && <View key={celebrationKey} pointerEvents="none" style={styles.homeCelebration}><ConfettiBurst colors={[palette.primary, palette.secondary, '#FF8178', '#55C4D8']} /></View>}
      <View style={styles.homeOverview}>
        <View style={styles.greetingBlock}><Text style={styles.hello}>Hi, {user.name.split(' ')[0]}</Text><Text style={styles.helloSub}>Small choices, big change.</Text></View>
        <View style={styles.homeStats}>
          <View accessible accessibilityLabel={`${user.streak} day streak`} style={[styles.streakPill, { backgroundColor: 'rgba(255,255,255,0.9)' }]}><Text style={styles.statEmoji}>🔥</Text><Text style={styles.statNumber}>{user.streak}</Text></View>
          <View accessible accessibilityLabel={`${user.points} spendable leaves`} style={[styles.pointsPill, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={15} color={colors.ink} /><Text style={styles.statNumber}>{user.points}</Text></View>
        </View>
      </View>

      <View accessible accessibilityLabel={`${user.lifetimePoints.toLocaleString()} lifetime leaves. Level ${level.level}. ${level.current.toLocaleString()} of ${level.required.toLocaleString()} leaves toward level ${level.level + 1}.`} style={[styles.lifetimeCard, { backgroundColor: 'rgba(255,255,255,0.91)' }]}>
        <View style={styles.lifetimeTop}>
          <View style={styles.lifetimeLabel}><View style={[styles.lifetimeIcon, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={13} color={colors.ink} /></View><View><Text style={styles.lifetimeTitle}>Lifetime leaves</Text><Text style={styles.lifetimeTotal}>{user.lifetimePoints.toLocaleString()}</Text></View></View>
          <View style={[styles.levelPill, { backgroundColor: withAlpha(palette.primary, 0.3) }]}><Text style={styles.levelText}>Level {level.level}</Text></View>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: level.required, now: level.current, text: `${Math.round(level.progress * 100)} percent to level ${level.level + 1}` }} style={styles.levelTrack}><View style={[styles.levelFill, { width: progressWidth, backgroundColor: palette.primary }]} /></View>
        <View style={styles.levelFooter}><Text style={styles.levelProgress}>{level.current.toLocaleString()} / {level.required.toLocaleString()}</Text><Text style={styles.levelNext}>to level {level.level + 1}</Text></View>
      </View>

      <View style={[styles.sceneArea, showCloset && { minHeight: 132, marginTop: 2, marginBottom: 0 }]}>
        <View {...rotationPan.panHandlers} style={StyleSheet.absoluteFill} accessible accessibilityRole="adjustable" accessibilityLabel={`${user.plushieName}, interactive 3D natural calico bear`} accessibilityHint="Drag left or right to rotate. Automatic rotation resumes when released.">
          <PlushieScene accessories={user.equippedAccessories} manualRotation={manualRotation} isInteracting={isInteracting} autoRotate={!reduceMotion} />
        </View>
        <View style={[styles.rotationHint, { backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.06)' }]}><Ionicons name={isInteracting ? 'hand-left' : 'move-outline'} size={12} color={colors.inkMuted} /><Text style={[styles.rotationText, { color: '#405B52', fontSize: 12, fontWeight: '700' }]}>{isInteracting ? 'Rotating' : 'Drag to rotate'}</Text></View>
      </View>

      <View style={[styles.homeBottom, showCloset && { paddingTop: 0 }]}>
        <View style={[styles.plushieIdentity, showCloset && { paddingTop: 0, paddingBottom: 7 }]}>
          <Text style={styles.plushieName}>{user.plushieName}</Text>
          <Text style={styles.plushieType}>{user.plushieType ?? 'Natural calico bear'}</Text>
        </View>

        {!showCloset && dailyGreetingDue && (
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`NFC is listening for ${user.plushieName}. ${dailyInteractionCopy}`}
            style={[styles.dailyTap, { minHeight: 78, backgroundColor: blendWithWhite(palette.primary, 0.74) }]}
          >
            <View style={[styles.dailyTapIcon, { backgroundColor: 'rgba(255,255,255,0.86)' }]}>
              <Ionicons name={nfcStatus === 'reading' ? 'sparkles' : 'radio-outline'} size={18} color={palette.deep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dailyTapEyebrow, { fontSize: 10, lineHeight: 13 }]}>{firstGreeting ? 'FIRST GREETING' : 'DAILY GREETING'}</Text>
              <Text style={[styles.dailyTapTitle, { fontSize: 14, lineHeight: 18 }]}>{firstGreeting ? `Greet ${user.plushieName} to begin` : `Say hello to ${user.plushieName}`}</Text>
              <Text style={[styles.dailyTapText, { color: '#405B52', fontSize: 12, lineHeight: 16, fontWeight: '500' }]}>{dailyInteractionCopy || (firstGreeting ? 'Tap the novo patch to reveal your first quests and begin your streak.' : 'Tap the novo patch to refresh today’s quests and continue your streak.')}</Text>
            </View>
            {nfcStatus === 'ready' && <View style={styles.nfcReadyDot} />}
          </View>
        )}

        {showCloset ? (
          <GlassPanel style={[styles.closet, { height: 210 }]}>
          <View style={styles.closetTop}><View><Text style={styles.closetTitle}>Wardrobe</Text><Text style={styles.closetHint}>Rarest first · wear more than one</Text></View><Pressable onPress={() => setShowCloset(false)} accessibilityLabel="Close wardrobe" style={styles.miniClose}><Ionicons name="close" size={18} color={colors.ink} /></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroller} contentContainerStyle={styles.categoryList}>
            {categoryFilters.map((category) => {
              const active = accessoryFilter === category.id;
              return <Pressable key={category.id} onPress={() => setAccessoryFilter(category.id)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.categoryChip, { minHeight: 34 }, active && { backgroundColor: palette.deep }]}><Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{category.label}</Text></Pressable>;
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accessoryScroller} contentContainerStyle={styles.accessoryList}>
            {visibleAccessories.map((item) => {
              const owned = user.accessories.includes(item.id);
              const waitingForPairing = user.pendingAccessories.includes(item.id);
              const equipped = user.equippedAccessories.includes(item.id);
              const rarity = rarityColors[item.rarity];
              return (
                <Pressable key={item.id} disabled={!owned} onPress={() => onToggleAccessory(item.id)} accessibilityRole="switch" accessibilityLabel={`${item.name}, ${categoryLabel(item.category)}, ${item.rarity}${waitingForPairing ? ', awaiting QR pairing' : ''}`} accessibilityState={{ checked: equipped, disabled: !owned }} style={[styles.accessoryCard, { height: 92, backgroundColor: item.color }, equipped && styles.accessoryChipActive, !owned && styles.locked]}>
                  <View style={styles.accessoryCardTop}><View style={styles.accessoryIconBubble}><Ionicons name={accessoryIcon(item.id)} size={19} color={colors.ink} /></View><Ionicons name={equipped ? 'checkmark-circle' : owned ? 'add-circle-outline' : waitingForPairing ? 'qr-code-outline' : 'lock-closed'} size={17} color={equipped ? colors.forest : colors.inkMuted} /></View>
                  <Text style={styles.accessoryChipText} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.accessoryMeta}><Text style={styles.accessoryCategory}>{waitingForPairing ? 'Scan QR to enable' : categoryLabel(item.category)}</Text><View style={[styles.rarityPill, { backgroundColor: rarity.background }]}><Text style={[styles.rarityText, { color: rarity.text }]}>{item.rarity}</Text></View></View>
                </Pressable>
              );
            })}
          </ScrollView>
          </GlassPanel>
        ) : (
          <View style={styles.homeActions}>
            <Pressable onPress={() => setShowCloset(true)} accessibilityRole="button" accessibilityLabel={`Open wardrobe. ${user.equippedAccessories.length} accessories equipped.`} accessibilityHint="Choose which paired accessories your plushie wears" style={[styles.homeActionPrimary, { backgroundColor: palette.deep }]}><Ionicons name="shirt-outline" size={20} color="#FFFFFF" /><Text style={styles.homeActionPrimaryText}>Accessories</Text><View style={styles.stackBadge}><Text style={styles.stackBadgeText}>{user.equippedAccessories.length}</Text></View></Pressable>
            <Pressable onPress={onScanAccessory} accessibilityRole="button" accessibilityLabel="Scan accessory QR code" accessibilityHint="Pair a physical accessory with your novo account" style={[styles.homeActionSecondary, { backgroundColor: palette.primary }]}><Ionicons name="qr-code-outline" size={22} color={colors.ink} /><Text style={styles.homeActionSecondaryText}>Scan</Text></Pressable>
          </View>
        )}
      </View>
    </View>
  );
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
  return <View style={[styles.glowCanvas, { pointerEvents: 'none' }]}><Svg width="146%" height="146%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet"><Defs>{shown.map((id, index) => <SvgRadialGradient key={id} id={`novo-glow-${index}`} cx="50%" cy="50%" rx="50%" ry="50%"><Stop offset="0%" stopColor={accessoryPalettes[id].primary} stopOpacity="0.34"/><Stop offset="42%" stopColor={accessoryPalettes[id].primary} stopOpacity="0.14"/><Stop offset="76%" stopColor={accessoryPalettes[id].primary} stopOpacity="0.025"/><Stop offset="100%" stopColor={accessoryPalettes[id].primary} stopOpacity="0"/></SvgRadialGradient>)}</Defs>{shown.map((id, index) => <Circle key={id} cx={positions[index]?.x ?? 200} cy={positions[index]?.y ?? 200} r={index ? 190 : 224} fill={`url(#novo-glow-${index})`}/>)}</Svg></View>;
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

function MarketplacePage({ user, token, palette, onPurchase, onContribute }: { user: User; token: string; palette: Palette; onPurchase: (id: AccessoryId, cost: number, lockerLocation: string) => Promise<void>; onContribute: (points: number, causeId: string, causeName: string) => Promise<void> }) {
  const [marketTab, setMarketTab] = useState<'accessories' | 'charities'>('accessories');
  const marketScrollRef = useRef<ScrollView>(null);
  const [selection, setSelection] = useState<MarketSelection | null>(null);
  const [locker, setLocker] = useState('');
  const [lockerOpen, setLockerOpen] = useState(false);
  const [lockers, setLockers] = useState<NovoLocation[]>([]);
  const [success, setSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const offers: AccessoryOffer[] = [
    { id: 'sunny-cap', price: 320, description: 'A sunny everyday cap made from recovered cotton and sized for your Novo plushie.' },
    { id: 'trail-scarf', price: 460, description: 'A soft woven scarf made with rescued yarn for breezy cleanup adventures.' },
    { id: 'cloud-mitts', price: 280, description: 'Mint mitts stitched from fabric offcuts to keep little paws adventure-ready.' },
    { id: 'meadow-socks', price: 240, description: 'Comfy green socks made in a small run from reclaimed jersey.' },
  ];
  const charities: CharityOffer[] = [
    { id: 'clean-shores', name: 'Singapore Clean Shores', detail: 'Fund gloves and collection bags.', description: 'Your leaves help volunteer teams get reusable gloves, sorting sacks, and safe collection tools for local shoreline cleanups.', icon: 'water', points: 100 },
    { id: 'food-rescue', name: 'Food Rescue Network', detail: 'Move surplus meals to neighbours.', description: 'Support cold bags and last-mile transport that move good surplus food from businesses to nearby communities.', icon: 'restaurant', points: 150 },
    { id: 'repair-commons', name: 'Repair Commons', detail: 'Keep useful objects in circulation.', description: 'Help community repair sessions provide shared tools, spare parts, and guidance that keep everyday items in use.', icon: 'construct', points: 200 },
  ];
  useEffect(() => {
    getMarketLockers(token).then(setLockers).catch(() => setLockers([]));
  }, [token]);
  const closeSheet = () => { setSelection(null); setLocker(''); setLockerOpen(false); setSuccess(false); setProcessing(false); };
  const confirmSelection = async () => {
    if (!selection || processing || (selection.kind === 'accessory' && !locker)) return;
    setProcessing(true);
    try {
      if (selection.kind === 'accessory') await onPurchase(selection.offer.id, selection.offer.price, locker);
      else await onContribute(selection.charity.points, selection.charity.id, selection.charity.name);
      setSuccess(true);
    } catch {
      // The app-level mutation handler shows the API error. Keep this sheet open
      // so the user can change their locker or try again without an unhandled promise.
    } finally {
      setProcessing(false);
    }
  };
  const selectedAccessory = selection?.kind === 'accessory' ? ACCESSORIES.find((item) => item.id === selection.offer.id) : undefined;
  const selectedPoints = selection?.kind === 'accessory' ? selection.offer.price : selection?.charity.points ?? 0;
  const selectedOwned = selection?.kind === 'accessory' && (user.accessories.includes(selection.offer.id) || user.pendingAccessories.includes(selection.offer.id));
  const canConfirm = Boolean(selection) && !processing && user.points >= selectedPoints && !selectedOwned && (selection?.kind === 'charity' || Boolean(locker));

  useEffect(() => {
    marketScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [marketTab]);

  return (
    <View style={styles.pagePad}>
      <PageTitle eyebrow="SPEND WITH PURPOSE" title="Marketplace" right={<View style={[styles.balance, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={16} color={colors.ink} /><Text style={styles.balanceText}>{user.points}</Text></View>} />
      <View accessibilityRole="tablist" style={styles.marketTabs}>
        {(['accessories', 'charities'] as const).map((id) => {
          const selected = marketTab === id;
          return <Pressable key={id} onPress={() => setMarketTab(id)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.marketTab, selected && { backgroundColor: palette.deep }]}><Text style={[styles.marketTabText, selected && styles.marketTabTextActive]}>{id === 'accessories' ? 'Accessories' : 'Charities'}</Text></Pressable>;
        })}
      </View>
      <ScrollView ref={marketScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.marketScroll, { paddingBottom: 104 }]}>
        {marketTab === 'accessories' ? (
          <>
            <View style={styles.marketHero}><LinearGradient colors={[palette.deep, palette.secondary]} style={StyleSheet.absoluteFill} /><View style={styles.marketOrb} /><Text style={styles.marketEyebrow}>FEATURED DROP</Text><Text style={styles.marketTitle}>Wear the change.</Text><Text style={styles.marketText}>Collect expressive pieces with the leaves you earn.</Text></View>
            <View style={styles.catalogGrid}>{offers.map((offer) => {
              const accessory = ACCESSORIES.find((item) => item.id === offer.id)!;
              const owned = user.accessories.includes(offer.id) || user.pendingAccessories.includes(offer.id);
              return <Pressable key={offer.id} onPress={() => { setSelection({ kind: 'accessory', offer }); setSuccess(false); }} accessibilityLabel={`${accessory.name}, ${offer.price} leaves${owned ? ', owned' : ''}`} style={({ pressed }) => [styles.catalogCard, pressed && styles.cardPressed]}><View style={[styles.catalogPreview, { backgroundColor: accessory.color }]}>{selection ? <Ionicons name={accessoryIcon(offer.id)} size={42} color={colors.inkMuted} /> : <AccessoryPreview3D id={offer.id} />}<View style={[styles.catalogRarity, { backgroundColor: rarityColors[accessory.rarity].background }]}><Text style={[styles.rarityText, { color: rarityColors[accessory.rarity].text }]}>{accessory.rarity}</Text></View></View><View style={styles.catalogInfo}><View style={{ flex: 1 }}><Text style={styles.catalogName} numberOfLines={1}>{accessory.name}</Text><Text style={styles.catalogCategory}>{categoryLabel(accessory.category)}</Text></View><View style={[styles.catalogPrice, owned && styles.catalogOwned]}><Ionicons name={owned ? 'checkmark' : 'leaf'} size={13} color={owned ? colors.forest : '#FFFFFF'} /><Text style={[styles.catalogBuyText, owned && { color: colors.forest }]}>{owned ? 'Owned' : offer.price}</Text></View></View></Pressable>;
            })}</View>
          </>
        ) : (
          <View style={styles.charityList}>{charities.map((charity) => <Pressable key={charity.id} accessibilityLabel={`${charity.name}, ${charity.points} leaves`} onPress={() => { setSelection({ kind: 'charity', charity }); setSuccess(false); }} style={({ pressed }) => [styles.charityCard, pressed && styles.cardPressed]}><View style={[styles.charityIcon, { backgroundColor: palette.soft }]}><Ionicons name={charity.icon} size={24} color={palette.deep} /></View><View style={{ flex: 1 }}><Text style={styles.charityTitle}>{charity.name}</Text><Text style={styles.charityText}>{charity.detail}</Text></View><View style={[styles.charityPrice, { backgroundColor: palette.deep }]}><Ionicons name="leaf" size={12} color="#FFFFFF" /><Text style={styles.donateText}>{charity.points}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.inkMuted} /></Pressable>)}</View>
        )}
      </ScrollView>

      <Modal visible={Boolean(selection)} animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
        <View style={styles.checkoutModal}>
          <FadeScrim />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close purchase details" />
          <RollingSheet style={styles.checkoutSheet}>
            <View style={styles.sheetHandle} />
            <Pressable onPress={closeSheet} accessibilityLabel="Close" style={styles.checkoutClose}><Ionicons name="close" size={21} color={colors.ink} /></Pressable>
            {success ? (
              <View style={styles.successPane}><ConfettiBurst colors={[palette.primary, palette.secondary, '#FF8178', '#55C4D8']} /><View style={[styles.successIcon, { backgroundColor: palette.primary }]}><Ionicons name="checkmark" size={38} color={colors.ink} /></View><Text style={styles.successTitle}>{selection?.kind === 'accessory' ? 'Order confirmed!' : 'Thank you!'}</Text><Text style={styles.successText}>{selection?.kind === 'accessory' ? `${selectedAccessory?.name} is now visible in your wardrobe. After pickup at ${locker}, scan its physical QR code to enable and equip it.` : `Your ${selectedPoints} leaves are now supporting ${selection?.charity.name}.`}</Text><Pressable onPress={closeSheet} style={[styles.doneButton, { backgroundColor: palette.deep }]}><Text style={styles.doneButtonText}>Done</Text></Pressable></View>
            ) : selection?.kind === 'accessory' && selectedAccessory ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checkoutContent}>
                <View style={[styles.tryOnStage, { backgroundColor: selectedAccessory.color }]}><AccessoryGlow accessories={[selection.offer.id]} /><PlushieScene key={selection.offer.id} accessories={Array.from(new Set([...user.equippedAccessories, selection.offer.id]))} /><View style={styles.tryOnLabel}><Ionicons name="sparkles" size={14} color={palette.deep} /><Text style={[styles.tryOnLabelText, { color: palette.deep }]}>Live try-on</Text></View></View>
                <View style={styles.checkoutHeading}><View style={{ flex: 1 }}><Text style={styles.checkoutEyebrow}>{selectedAccessory.rarity.toUpperCase()} · {categoryLabel(selectedAccessory.category).toUpperCase()}</Text><Text style={styles.checkoutTitle}>{selectedAccessory.name}</Text></View><View style={[styles.checkoutPrice, { backgroundColor: palette.primary }]}><Ionicons name="leaf" size={15} color={colors.ink} /><Text style={styles.checkoutPriceText}>{selection.offer.price}</Text></View></View>
                <Text style={styles.checkoutDescription}>{selection.offer.description}</Text>
                <View><Text style={styles.fieldLabel}>Pick-up locker</Text><Pressable onPress={() => setLockerOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: lockerOpen }} style={[styles.lockerSelect, lockerOpen && styles.lockerSelectOpen]}><Ionicons name="location-outline" size={20} color={palette.deep} /><Text style={[styles.lockerSelectText, !locker && styles.lockerPlaceholder]} numberOfLines={1}>{locker || (lockers.length ? 'Choose a Pick! or SingPost locker' : 'Locker list unavailable')}</Text><Ionicons name={lockerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} /></Pressable>{lockerOpen && <View style={styles.lockerMenu}>{lockers.map((location) => <Pressable key={location.id} onPress={() => { setLocker(`${location.name} · ${location.address}`); setLockerOpen(false); }} style={styles.lockerOption}><Ionicons name={locker.startsWith(location.name) ? 'radio-button-on' : 'radio-button-off'} size={18} color={palette.deep} /><View style={{ flex: 1 }}><Text style={styles.lockerOptionText}>{location.name}</Text><Text style={styles.lockerAddress}>{location.address}</Text></View></Pressable>)}</View>}</View>
                {selectedOwned ? <View style={styles.checkoutNotice}><Ionicons name="checkmark-circle" size={20} color={colors.forest} /><Text style={styles.checkoutNoticeText}>This accessory is already in your wardrobe.</Text></View> : user.points < selection.offer.price ? <View style={styles.checkoutNotice}><Ionicons name="leaf-outline" size={20} color={colors.danger} /><Text style={styles.checkoutNoticeText}>You need {selection.offer.price - user.points} more leaves.</Text></View> : null}
                <ConfirmSlider key={`${selection.offer.id}-${locker}`} label={processing ? 'Completing purchase…' : `Slide to buy · ${selection.offer.price} leaves`} color={palette.deep} disabled={!canConfirm} onConfirm={confirmSelection} />
                <Text style={styles.sliderHint}>{locker ? 'Pickup is free. Your locker code appears after fulfilment.' : 'Choose a locker to unlock checkout.'}</Text>
              </ScrollView>
            ) : selection?.kind === 'charity' ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.charityCheckout, { paddingTop: 24, paddingBottom: 4, gap: 10 }]}><View style={[styles.charityHeroIcon, { width: 78, height: 78, borderRadius: 26, backgroundColor: palette.soft }]}><Ionicons name={selection.charity.icon} size={38} color={palette.deep} /></View><Text style={styles.checkoutEyebrow}>COMMUNITY IMPACT</Text><Text style={styles.checkoutTitle}>{selection.charity.name}</Text><Text style={[styles.checkoutDescription, styles.charityDescription]}>{selection.charity.description}</Text><View style={[styles.impactRow, { marginVertical: 2 }]}><View style={styles.impactPill}><Ionicons name="shield-checkmark-outline" size={16} color={palette.deep} /><Text style={styles.impactPillText}>Verified partner</Text></View><View style={styles.impactPill}><Ionicons name="receipt-outline" size={16} color={palette.deep} /><Text style={styles.impactPillText}>Impact updates</Text></View></View><ConfirmSlider key={selection.charity.id} label={processing ? 'Sending leaves…' : `Slide to give · ${selection.charity.points} leaves`} color={palette.deep} disabled={!canConfirm} onConfirm={confirmSelection} /><Text style={styles.sliderHint}>Your leaves cannot be refunded after they are contributed.</Text></ScrollView>
            ) : null}
          </RollingSheet>
        </View>
      </Modal>
    </View>
  );
}

function ConfirmSlider({ label, color, disabled, onConfirm }: { label: string; color: string; disabled?: boolean; onConfirm: () => Promise<void> }) {
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
        Animated.timing(translateX, { toValue: maximum, duration: 130, useNativeDriver: true }).start(() => void onConfirm());
      } else Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  }), [disabled, onConfirm, translateX]);

  useEffect(() => { translateX.setValue(0); }, [disabled, translateX]);
  return <View onLayout={(event) => { width.current = event.nativeEvent.layout.width; }} style={[styles.confirmSlider, disabled && styles.confirmSliderDisabled]} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityHint="Drag the leaf to the right to confirm" accessibilityActions={[{ name: 'activate', label: 'Confirm' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate' && !disabled) void onConfirm(); }}><Text style={styles.confirmSliderText}>{label}</Text><Animated.View {...pan.panHandlers} style={[styles.confirmKnob, { backgroundColor: color, transform: [{ translateX }] }]}><Ionicons name="leaf" size={21} color="#FFFFFF" /><Ionicons name="chevron-forward" size={13} color="#FFFFFF" /></Animated.View></View>;
}

function ConfettiBurst({ colors: confettiColors }: { colors: string[] }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: 24 }, (_, index) => ({ left: `${(index * 37) % 96}%` as DimensionValue, delay: (index % 6) * 45, color: confettiColors[index % confettiColors.length], rotate: `${(index * 53) % 180}deg` })), [confettiColors]);
  useEffect(() => { Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [progress]);
  return <View style={[styles.confettiLayer, { pointerEvents: 'none' }]}>{pieces.map((piece, index) => <Animated.View key={index} style={[styles.confettiPiece, { left: piece.left, top: -12, backgroundColor: piece.color, opacity: progress.interpolate({ inputRange: [0, 0.15, 0.88, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 330 + piece.delay] }) }, { rotate: piece.rotate }] }]} />)}</View>;
}

function FadeScrim() {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.modalScrim, { opacity }]} />;
}

function RollingSheet({ children, style }: { children: ReactNode; style: object }) {
  const translateY = useRef(new Animated.Value(560)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 230, mass: 0.9, useNativeDriver: true }).start();
  }, [translateY]);
  return <Animated.View style={[style, { transform: [{ translateY }] }]}>{children}</Animated.View>;
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
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => Promise.all([getLocations(), getMemberTasks(token)]).then(([nextLocations, tasks]) => {
    setLocations(nextLocations.filter((location) => location.kind === 'return-right'));
    setQuests(tasks.quests);
    setEvents(tasks.events);
    setSubmissions(tasks.submissions);
  });
  useEffect(() => { refresh().catch(() => undefined); }, [token]);
  const locateUser = async (showError = true) => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Enable location access to see yourself and nearby activities on the map.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      setFocusUser((current) => current + 1);
    } catch (reason) {
      if (showError) Alert.alert('Location unavailable', reason instanceof Error ? reason.message : 'Could not find your current location.');
    } finally { setLocating(false); }
  };
  useEffect(() => { void locateUser(false); }, []);

  const openTask = (quest: User['dailyQuests'][number] | null) => {
    setActiveQuest(quest);
    setTitle(quest?.title ?? '');
    setDescription(''); setPhoto(null); setComposerOpen(true);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to submit photo evidence.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: false, quality: 0.7 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.uri) return;
    try {
      const resized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1280 } }], { compress: 0.58, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!resized.base64) throw new Error('The camera did not return image data.');
      setPhoto({ uri: resized.uri, dataUrl: `data:image/jpeg;base64,${resized.base64}` });
    } catch (reason) {
      Alert.alert('Could not prepare photo', reason instanceof Error ? reason.message : 'Take the evidence photo again.');
    }
  };

  const submit = async () => {
    if (!photo || title.trim().length < 3 || description.trim().length < 10) return;
    setSubmitting(true);
    try {
      const result = activeQuest
        ? await submitDailyTask(token, activeQuest.id, { description: description.trim(), photoDataUrl: photo.dataUrl })
        : await submitCustomTask(token, { title: title.trim(), description: description.trim(), photoDataUrl: photo.dataUrl });
      await onUserUpdated(result.user);
      setComposerOpen(false); setActiveQuest(null); setTitle(''); setDescription(''); setPhoto(null);
      await refresh();
      Alert.alert(result.automated ? 'Task verified' : 'Sent for review', result.automated ? `The evidence cleared the 80% confidence threshold. ${result.submission.points} leaves were added.` : 'Staff will check your photo and choose the final leaf reward.');
    } catch (reason) {
      Alert.alert('Could not submit task', reason instanceof Error ? reason.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const registerForEvent = async () => {
    if (!activeEvent || activeEvent.registered) return;
    try {
      const updated = await signUpForEvent(token, activeEvent.id);
      setActiveEvent(updated);
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
    } catch (reason) { Alert.alert('Could not register', reason instanceof Error ? reason.message : 'Try again.'); }
  };
  const selectMapEvent = useCallback((eventId: string) => setActiveEvent(events.find((event) => event.id === eventId) ?? null), [events]);

  const tabs = <View accessibilityRole="tablist" style={styles.tasksTabs}>{(['map', 'tasks'] as const).map((item) => <Pressable key={item} onPress={() => setView(item)} accessibilityRole="tab" accessibilityState={{ selected: view === item }} style={[styles.tasksTab, view === item && { backgroundColor: palette.deep }]}><Ionicons name={item === 'map' ? 'map-outline' : 'list-outline'} size={17} color={view === item ? '#FFFFFF' : colors.inkMuted} /><Text style={[styles.tasksTabText, view === item && styles.tasksTabTextActive]}>{item === 'map' ? 'Map' : 'Tasks'}</Text></Pressable>)}</View>;

  return (
    <View style={styles.mapPage}>
      <TasksMap locations={locations} events={events} userLocation={userLocation} focusUser={focusUser} onEventPress={selectMapEvent} />
      <LinearGradient colors={['rgba(250,252,249,0.92)', 'rgba(250,252,249,0)']} style={[styles.mapTopFade, { pointerEvents: 'none' }]} />
      <View style={styles.mapControls}><View style={styles.tasksControlRow}>{tabs}<Pressable onPress={() => void locateUser()} style={[styles.locateButton, userLocation && { backgroundColor: palette.primary }]} accessibilityLabel="Show my current location"><Ionicons name={locating ? 'hourglass-outline' : 'navigate'} size={20} color={colors.ink} /></Pressable></View>{view === 'map' && <View style={styles.mapLegend}><View style={[styles.legendDot, { backgroundColor: '#E74E43' }]} /><Text style={styles.legendText}>Live</Text><View style={[styles.legendDot, { backgroundColor: '#7058C9' }]} /><Text style={styles.legendText}>Scheduled</Text><View style={[styles.legendSquare, { backgroundColor: '#227A62' }]} /><Text style={styles.legendText}>Return-Right</Text></View>}</View>
      {view === 'map' ? <GlassPanel style={styles.taskSheet}><View style={styles.sheetHandle} /><View style={styles.taskSheetHeader}><View style={{ flex: 1 }}><Text style={styles.taskSheetTitle}>Today’s quest board</Text><Text style={styles.taskSheetSub}>{quests.length ? 'Tap a task to add photo evidence' : 'Tap your plushie to reveal today’s quests'}</Text></View><View style={[styles.questCount, { backgroundColor: palette.primary }]}><Text style={styles.questCountText}>{quests.length}</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questBoard}>{quests.length ? quests.map((quest) => <QuestCard key={quest.id} quest={quest} compact onPress={() => openTask(quest)} />) : <Text style={styles.taskSheetSub}>Your daily quests will appear here after today’s NFC greeting.</Text>}</ScrollView></GlassPanel> : <View style={styles.tasksListPage}>
        <View style={styles.tasksListHeader}><View><Text style={styles.pageEyebrow}>QUESTS & EVENTS</Text><Text style={styles.taskPanelTitle}>Things to do</Text></View><Pressable onPress={() => openTask(null)} style={[styles.locateButton, { backgroundColor: palette.primary }]} accessibilityLabel="Create a custom task"><Ionicons name="camera" size={20} color={colors.ink} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tasksScroll}>
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Daily tasks</Text><Text style={styles.taskSectionSub}>Shaped by the accessories your plushie wears.</Text></View><View style={[styles.questCount, { backgroundColor: palette.primary }]}><Text style={styles.questCountText}>{quests.length}</Text></View></View>
          <View style={styles.dailyQuestList}>{quests.length ? quests.map((quest) => <QuestCard key={quest.id} quest={quest} onPress={() => openTask(quest)} />) : <Text style={styles.emptyState}>Greet your plushie with NFC to refresh today’s quests.</Text>}</View>
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Events</Text><Text style={styles.taskSectionSub}>{events.length} live or scheduled near you</Text></View></View>
          <View style={styles.eventList}>{events.length ? events.map((event) => <EventCard key={event.id} event={event} onPress={() => setActiveEvent(event)} />) : <Text style={styles.emptyState}>No live or scheduled events are available.</Text>}</View>
          <View style={styles.taskSectionHead}><View><Text style={styles.sectionTitle}>Your submissions</Text><Text style={styles.taskSectionSub}>Photo tasks awaiting or past review.</Text></View><Pressable onPress={() => openTask(null)} style={[styles.livePill, { backgroundColor: palette.primary }]}><Ionicons name="add" size={15} color={colors.ink} /><Text style={styles.liveText}>NEW</Text></Pressable></View>
          <View style={styles.eventList}>{submissions.length ? submissions.map((submission) => <View key={submission.id} style={styles.submissionCard}><View style={[styles.submissionIcon, { backgroundColor: submission.status === 'approved' ? '#DFF4E6' : '#EEE8FF' }]}><Ionicons name={submission.status === 'approved' ? 'checkmark' : 'time-outline'} size={18} color={submission.status === 'approved' ? colors.forest : colors.purple} /></View><View style={{ flex: 1 }}><Text style={styles.nearbyTitle}>{submission.task}</Text><Text style={styles.nearbyMeta}>{submission.status === 'pending' ? 'Waiting for staff review' : submission.status.replace('_', ' ')}</Text></View>{submission.points ? <Text style={styles.distance}>+{submission.points}</Text> : null}</View>) : <Text style={styles.emptyState}>No custom tasks submitted yet.</Text>}</View>
        </ScrollView>
      </View>}
      <Modal visible={composerOpen} transparent animationType="none" statusBarTranslucent onRequestClose={() => setComposerOpen(false)}><View style={styles.taskModal}><FadeScrim /><Pressable style={StyleSheet.absoluteFill} onPress={() => setComposerOpen(false)} /><RollingSheet style={styles.taskComposer}><View style={styles.sheetHandle} /><View style={styles.taskComposerHead}><View style={{ flex: 1 }}><Text style={styles.pageEyebrow}>{activeQuest ? 'DAILY TASK' : 'CUSTOM TASK'}</Text><Text style={styles.taskComposerTitle}>{activeQuest ? activeQuest.title : 'Show what you changed'}</Text>{activeQuest && <Text style={styles.taskSectionSub}>Worth {activeQuest.points} leaves · {activeQuest.description}</Text>}</View><Pressable onPress={() => setComposerOpen(false)} style={styles.miniClose}><Ionicons name="close" size={18} color={colors.ink} /></Pressable></View>{!activeQuest && <TextInput value={title} onChangeText={setTitle} placeholder="Task title" placeholderTextColor={colors.inkMuted} style={styles.taskInput} />}<TextInput value={description} onChangeText={setDescription} placeholder="Describe what you did and how it reduced waste" placeholderTextColor={colors.inkMuted} multiline style={[styles.taskInput, styles.taskDescription]} /><Pressable onPress={takePhoto} style={styles.photoEvidence}>{photo ? <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} /> : <><Ionicons name="camera-outline" size={28} color={palette.deep} /><Text style={styles.photoEvidenceText}>Take evidence photo</Text></>}</Pressable><View style={styles.aiNotice}><Ionicons name="sparkles" size={18} color={colors.purple} /><Text style={styles.aiNoticeText}>YOLO verification awards points only at 80% confidence or higher. Everything else goes safely to staff review.</Text></View><Pressable disabled={!photo || title.trim().length < 3 || description.trim().length < 10 || submitting} onPress={submit} style={[styles.taskSubmit, { backgroundColor: palette.deep }, (!photo || submitting) && styles.locked]}><Text style={styles.taskSubmitText}>{submitting ? 'Checking evidence…' : activeQuest ? 'Submit task evidence' : 'Submit custom task'}</Text></Pressable></RollingSheet></View></Modal>
      <Modal visible={Boolean(activeEvent)} transparent animationType="none" statusBarTranslucent onRequestClose={() => setActiveEvent(null)}><View style={styles.taskModal}><FadeScrim /><Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveEvent(null)} /><RollingSheet style={styles.eventDetailSheet}>{activeEvent && <><View style={[styles.eventDetailHero, { backgroundColor: activeEvent.status === 'live' ? '#E74E43' : palette.deep }]}><View style={styles.eventSheetHandle} /><Text style={styles.eventDetailEyebrow}>{activeEvent.status === 'live' ? 'LIVE NOW' : 'UPCOMING EVENT'}</Text><Text style={styles.eventDetailPoints}>+{activeEvent.points} leaves</Text></View><View style={styles.eventDetailContent}><Text style={styles.eventDetailTitle}>{activeEvent.title}</Text><View style={styles.eventDetailLine}><Ionicons name="location-outline" size={18} color={palette.deep} /><Text style={styles.eventDetailMeta}>{activeEvent.location}</Text></View><View style={styles.eventDetailLine}><Ionicons name="calendar-outline" size={18} color={palette.deep} /><Text style={styles.eventDetailMeta}>{new Date(activeEvent.startsAt).toLocaleString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} · {activeEvent.durationMinutes} min</Text></View><View style={styles.eventDetailLine}><Ionicons name="people-outline" size={18} color={palette.deep} /><Text style={styles.eventDetailMeta}>{activeEvent.attending}{activeEvent.capacity ? ` of ${activeEvent.capacity}` : ''} registered</Text></View><Pressable disabled={activeEvent.registered || (activeEvent.capacity !== null && activeEvent.attending >= activeEvent.capacity)} onPress={() => void registerForEvent()} style={[styles.taskSubmit, { backgroundColor: activeEvent.registered ? '#DCE5DB' : palette.deep }]}><Text style={[styles.taskSubmitText, activeEvent.registered && { color: colors.forest }]}>{activeEvent.registered ? 'You’re registered' : activeEvent.capacity !== null && activeEvent.attending >= activeEvent.capacity ? 'Event full' : 'Sign up for this event'}</Text></Pressable></View></>}</RollingSheet></View></Modal>
    </View>
  );
}

function QuestCard({ quest, compact = false, onPress }: { quest: User['dailyQuests'][number]; compact?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={quest.completed} style={[styles.questCard, compact && styles.questCardCompact, quest.completed && styles.completedTask]}><View style={styles.questCardTop}><View style={styles.questPoints}><Ionicons name={quest.completed ? 'checkmark' : 'leaf'} size={12} color={colors.forest} /><Text style={styles.questPointsText}>{quest.completed ? 'Done' : quest.points}</Text></View>{quest.sourceAccessoryName ? <View style={styles.questSource}><Ionicons name="sparkles" size={11} color={colors.purple} /><Text numberOfLines={1} style={styles.questSourceText}>{quest.sourceAccessoryName}</Text></View> : null}</View><Text style={styles.questTitle}>{quest.title}</Text><Text numberOfLines={compact ? 2 : 3} style={styles.questDescription}>{quest.description}</Text></Pressable>;
}

function EventCard({ event, onPress }: { event: NovoEvent; onPress: () => void }) {
  const date = new Date(event.startsAt);
  const timing = event.status === 'live' ? 'Live now' : date.toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return <Pressable onPress={onPress} style={styles.eventCard}><View style={[styles.eventBadge, { backgroundColor: event.status === 'live' ? '#E74E43' : '#7058C9' }]}><Text style={styles.eventBadgePoints}>{event.points}</Text><Text style={styles.eventBadgeLabel}>LEAVES</Text></View><View style={{ flex: 1 }}><View style={styles.eventStatusLine}><View style={[styles.eventStatusDot, { backgroundColor: event.status === 'live' ? '#E74E43' : '#7058C9' }]} /><Text style={styles.eventStatusText}>{timing}{event.registered ? ' · Registered' : ''}</Text></View><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.location} · {event.attending}{event.capacity ? `/${event.capacity}` : ''} going</Text></View><Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /></Pressable>;
}

function FriendsPage({ user, token, palette }: { user: User; token: string; palette: Palette }) {
  const inviteUrl = `novo://friends/add?user=${encodeURIComponent(user.id)}`;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [questFriends, setQuestFriends] = useState<string[]>([]);
  useEffect(() => { getFriends(token).then(setFriends).catch(() => setFriends([])); }, [token]);
  const shareInvite = () => Share.share({ message: `Join my Novo circle: ${inviteUrl}` });

  return (
    <View style={styles.pagePad}>
      <PageTitle eyebrow="YOUR CIRCLE" title="Friends" right={<Pressable onPress={shareInvite} style={[styles.roundButton, { backgroundColor: palette.primary }]}><Ionicons name="person-add" size={20} color={colors.ink} /></Pressable>} />
      <GlassPanel style={styles.inviteCard}><View style={styles.qrCode}><QRCode value={inviteUrl} size={82} color={palette.deep} backgroundColor="#FFFFFF" quietZone={5} /></View><View style={{ flex: 1 }}><Text style={styles.inviteTitle}>Grow your circle</Text><Text style={styles.inviteText}>Friends can scan this QR or open your private invite URL.</Text><Pressable onPress={shareInvite} style={styles.copyLink}><Ionicons name="link" size={15} color={palette.deep} /><Text style={[styles.copyLinkText, { color: palette.deep }]}>Share invite link</Text></Pressable></View></GlassPanel>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Your friends</Text><Text style={styles.sectionLink}>{friends.length} friends</Text></View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.friendList}>
        {friends.length ? friends.map((friend) => <FriendRow key={friend.id} name={friend.name} plushie={friend.plushieName} accessories={friend.accessories} lifetimePoints={friend.lifetimePoints} palette={palette} added={questFriends.includes(friend.id)} onQuest={() => setQuestFriends((current) => current.includes(friend.id) ? current.filter((id) => id !== friend.id) : [...current, friend.id])} onMore={() => Alert.alert(friend.name, `${friend.name} and ${friend.plushieName} have earned ${friend.lifetimePoints.toLocaleString()} lifetime leaves.`)} />) : <View style={styles.friendEmpty}><View style={[styles.friendEmptyIcon, { backgroundColor: blendWithWhite(palette.primary, 0.55) }]}><Ionicons name="people-outline" size={24} color={palette.deep} /></View><View style={styles.friendEmptyCopy}><Text style={styles.friendEmptyTitle}>Your circle starts here</Text><Text style={styles.friendEmptyText}>Share the QR above to add your first friend.</Text></View></View>}
      </ScrollView>
    </View>
  );
}

function FriendRow({ name, plushie, accessories, lifetimePoints, palette, added, onQuest, onMore }: { name: string; plushie: string; accessories: AccessoryId[]; lifetimePoints: number; palette: Palette; added: boolean; onQuest: () => void; onMore: () => void }) {
  const level = getLifetimeLevel(lifetimePoints);
  return <View style={styles.friendRow}><View style={styles.friendInfo}><View style={[styles.friendAvatar, { backgroundColor: blendWithWhite(accessoryPalettes[accessories[0] ?? 'bright-star'].primary, 0.66) }]}><Text style={styles.friendInitial}>{name[0]}</Text></View><View style={styles.friendCopy}><Text style={styles.friendName}>{name}</Text><View style={styles.friendPlushieLine}><Text style={styles.friendPlushieName}>{plushie}</Text><View style={styles.friendAccessories}>{accessories.map((id) => <View key={id} accessibilityLabel={ACCESSORIES.find((item) => item.id === id)?.name} style={[styles.friendBadge, { backgroundColor: accessoryPalettes[id].soft }]}><Ionicons name={accessoryIcon(id)} size={12} color={accessoryPalettes[id].deep} /></View>)}</View></View><Text style={styles.friendProgress}>{lifetimePoints.toLocaleString()} lifetime leaves · Level {level.level}</Text></View></View><View style={styles.friendActions}><Pressable onPress={onQuest} accessibilityLabel={added ? `Remove ${name} from quest` : `Add ${name} to quest`} style={[styles.questButton, { backgroundColor: added ? palette.primary : palette.deep }]}><Ionicons name={added ? 'checkmark' : 'flash-outline'} size={17} color={added ? colors.ink : '#FFFFFF'} /></Pressable><Pressable onPress={onMore} accessibilityLabel={`More actions for ${name}`} style={styles.moreButton}><Ionicons name="ellipsis-horizontal" size={18} color={colors.ink} /></Pressable></View></View>;
}

function SettingsPage({ user, palette, onUpdateNotifications, onSignOut, onUnpair, onDeleteAccount }: { user: User; palette: Palette; onUpdateNotifications: (preferences: User['notificationPreferences']) => Promise<void>; onSignOut: () => void; onUnpair: () => void; onDeleteAccount: () => void }) {
  const [showCredits, setShowCredits] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const confirmUnpair = () => Alert.alert('Unpair plushie?', `${user.plushieName} will need another NFC tap before you can return home.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Unpair', style: 'destructive', onPress: onUnpair }]);
  const confirmDelete = () => Alert.alert('Delete account?', 'This permanently removes your novo account, points, plushie and accessory collection from every device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: onDeleteAccount }]);
  if (showCredits) return <CreditsPage onBack={() => setShowCredits(false)} />;
  if (showNotifications) return <NotificationSettingsPage preferences={user.notificationPreferences} palette={palette} onBack={() => setShowNotifications(false)} onSave={onUpdateNotifications} />;
  return (
    <View style={styles.pagePad}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsPageContent}>
        <PageTitle eyebrow="MAKE IT YOURS" title="Settings" />
        <GlassPanel style={styles.profileCard}><View style={[styles.profileAvatar, { backgroundColor: palette.primary }]}><Text style={styles.profileInitial}>{user.name[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.profileName}>{user.name}</Text><Text style={styles.profileEmail}>{user.email}</Text></View><Pressable style={styles.editButton}><Text style={[styles.editText, { color: palette.deep }]}>Edit profile</Text></Pressable></GlassPanel>
        <View style={styles.settingsList}><Setting icon="notifications-outline" label="Notifications" onPress={() => setShowNotifications(true)} /><Setting icon="information-circle-outline" label="Credits" onPress={() => setShowCredits(true)} /><Setting icon="radio-outline" label={`Unpair ${user.plushieName}`} onPress={confirmUnpair} /></View>
        <View style={styles.accountActions}><Pressable onPress={onSignOut} style={styles.signOutButton}><Ionicons name="log-out-outline" size={19} color={colors.ink} /><Text style={styles.signOutText}>Sign out</Text></Pressable><Pressable onPress={confirmDelete} style={styles.deleteButton}><Ionicons name="trash-outline" size={19} color={colors.danger} /><Text style={styles.deleteText}>Delete account</Text></Pressable></View>
      </ScrollView>
    </View>
  );
}

function NotificationSettingsPage({ preferences, palette, onBack, onSave }: { preferences: User['notificationPreferences']; palette: Palette; onBack: () => void; onSave: (preferences: User['notificationPreferences']) => Promise<void> }) {
  const [value, setValue] = useState(preferences);
  const [busy, setBusy] = useState<keyof User['notificationPreferences'] | null>(null);
  const options: Array<{ key: keyof User['notificationPreferences']; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'dailyGreeting', title: 'Daily plushie greeting', detail: 'Protect your streak and refresh the quest board.', icon: 'radio-outline' },
    { key: 'tasks', title: 'Task reminders', detail: 'A gentle reminder before today’s tasks expire.', icon: 'checkmark-circle-outline' },
    { key: 'events', title: 'Events nearby', detail: 'Upcoming activities and registration reminders.', icon: 'calendar-outline' },
    { key: 'friends', title: 'Friend activity', detail: 'Invites and shared quest updates.', icon: 'people-outline' },
    { key: 'orders', title: 'Orders and pickup', detail: 'Locker updates and accessory pairing reminders.', icon: 'bag-check-outline' },
  ];
  const toggle = async (key: keyof User['notificationPreferences']) => {
    if (busy) return;
    const next = { ...value, [key]: !value[key] };
    setValue(next); setBusy(key);
    try { await onSave(next); }
    catch (reason) { setValue(value); Alert.alert('Notifications not updated', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(null); }
  };
  return <View style={styles.pagePad}><View style={styles.creditsHeader}><Pressable onPress={onBack} accessibilityLabel="Back to settings" style={styles.creditsBack}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable><View style={{ flex: 1 }}><Text style={styles.pageEyebrow}>REMINDERS</Text><Text style={styles.pageTitle}>Notifications</Text></View></View><Text style={styles.creditsIntro}>Choose the moments when novo may gently bring you back to your plushie and community.</Text><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.creditsList}>{options.map((option) => { const enabled = value[option.key]; return <Pressable key={option.key} disabled={Boolean(busy)} onPress={() => void toggle(option.key)} accessibilityRole="switch" accessibilityState={{ checked: enabled }} style={styles.notificationRow}><View style={[styles.creditMark, enabled && { backgroundColor: withAlpha(palette.primary, 0.5) }]}><Ionicons name={option.icon} size={20} color={palette.deep} /></View><View style={styles.creditCopy}><Text style={styles.creditName}>{option.title}</Text><Text style={styles.creditDetail}>{option.detail}</Text></View><View style={[styles.toggleTrack, enabled && { backgroundColor: palette.deep }]}><View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} /></View></Pressable>; })}<Text style={styles.creditsFootnote}>Your device permission and these preferences must both be enabled. Event, friend and order updates are prepared for server push delivery.</Text></ScrollView></View>;
}

function CreditsPage({ onBack }: { onBack: () => void }) {
  return <View style={styles.pagePad}>
    <View style={styles.creditsHeader}><Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={styles.creditsBack}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable><View style={{ flex: 1 }}><Text style={styles.pageEyebrow}>OPEN SOURCE</Text><Text style={styles.pageTitle}>Credits</Text></View></View>
    <Text style={styles.creditsIntro}>novo is built with open-source software and open map data. Thank you to the people and communities who make these projects possible.</Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.creditsList}>
      {OPEN_SOURCE_CREDITS.map((credit) => <Pressable key={credit.name} onPress={() => void Linking.openURL(credit.url)} accessibilityRole="link" style={styles.creditRow}><View style={styles.creditMark}><Ionicons name={credit.name === 'OpenStreetMap' ? 'map-outline' : 'code-slash-outline'} size={19} color={colors.forest} /></View><View style={styles.creditCopy}><Text style={styles.creditName}>{credit.name}</Text><Text style={styles.creditDetail}>{credit.detail}</Text><Text style={styles.creditLicense}>{credit.license}</Text></View><Ionicons name="open-outline" size={17} color={colors.inkMuted} /></Pressable>)}
      <Text style={styles.creditsFootnote}>Individual copyright notices, map attribution and licence texts are available here from each project.</Text>
    </ScrollView>
  </View>;
}

function Setting({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) { return <Pressable onPress={onPress} style={styles.settingRow}><View style={styles.settingIcon}><Ionicons name={icon} size={20} color={colors.ink} /></View><Text style={styles.settingLabel}>{label}</Text><Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /></Pressable>; }
function PageTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) { return <View style={styles.pageTitleRow}><View><Text style={styles.pageEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text></View>{right}</View>; }

function GlassPanel({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.glassBorder, style]}><BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', backgroundColor: 'rgba(255,255,255,0.18)' }]} /><>{children}</></View>; }

function GlassNav({ active, palette, onChange }: { active: Tab; palette: Palette; onChange: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; cta?: boolean }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' }, { id: 'marketplace', label: 'Market', icon: 'bag-handle-outline' }, { id: 'tasks', label: 'Tasks', icon: 'map-outline', cta: true }, { id: 'friends', label: 'Friends', icon: 'people-outline' }, { id: 'settings', label: 'Settings', icon: 'settings-outline' },
  ];
  return (
    <View style={styles.navWrap}>
      <View style={styles.navShadow}>
        <View style={styles.navClip}>
          <BlurView intensity={82} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.navRow}>
            {items.map((item) => { const selected = active === item.id; return <Pressable key={item.id} onPress={() => onChange(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.navItem, selected && { backgroundColor: item.cta ? withAlpha(palette.deep, 0.12) : withAlpha(palette.primary, 0.2) }]}><View style={[styles.navIconWrap, selected && !item.cta && { backgroundColor: `${palette.primary}CC` }, item.cta && { backgroundColor: selected ? palette.deep : withAlpha(palette.deep, 0.12) }]}><Ionicons name={selected ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon} size={21} color={item.cta && selected ? '#FFFFFF' : colors.ink} /></View><Text style={[styles.navText, { color: '#405B52', fontSize: 11, fontWeight: '700' }, selected && styles.navTextActive]}>{item.label}</Text></Pressable>; })}
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
  marketTabs: { minHeight: 46, padding: 4, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.68)', flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, marketTab: { flex: 1, minHeight: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, marketTabText: { color: colors.inkMuted, fontSize: 14, fontWeight: '700' }, marketTabTextActive: { color: '#FFFFFF' }, marketScroll: { gap: 14, paddingBottom: 20 }, marketHero: { minHeight: 124, borderRadius: 25, padding: 19, overflow: 'hidden', justifyContent: 'center' }, marketOrb: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)', right: -18, top: -40 }, marketEyebrow: { color: '#E7F59E', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, marketTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 6 }, marketText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18, marginTop: 4 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, sectionLink: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' }, catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, catalogCard: { width: '48%', flexGrow: 1, minHeight: 190, borderRadius: 22, padding: 9, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, cardPressed: { opacity: 0.76, transform: [{ scale: 0.985 }] }, catalogPreview: { height: 122, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, catalogRarity: { position: 'absolute', top: 8, right: 8, minHeight: 21, borderRadius: 99, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }, catalogInfo: { minHeight: 48, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, catalogName: { color: colors.ink, fontSize: 14, fontWeight: '800' }, catalogCategory: { color: colors.inkMuted, fontSize: 11, marginTop: 2 }, catalogPrice: { minWidth: 58, minHeight: 32, borderRadius: 11, paddingHorizontal: 8, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }, catalogOwned: { backgroundColor: '#EEF2EC' }, catalogBuyText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, charityList: { gap: 9 }, charityCard: { minHeight: 82, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10 }, charityIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, charityTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, charityText: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, charityPrice: { minHeight: 32, borderRadius: 11, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }, donateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  modalScrim: { backgroundColor: 'rgba(12,19,16,0.48)' }, checkoutModal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' }, checkoutSheet: { width: '100%', maxWidth: 680, maxHeight: '94%', minHeight: 420, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 13, paddingHorizontal: 18, paddingBottom: 24, backgroundColor: '#FCFDF9', overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 24 }, checkoutClose: { position: 'absolute', top: 18, right: 18, width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 20 }, checkoutContent: { paddingTop: 9, paddingBottom: 6, gap: 13 }, tryOnStage: { height: 245, borderRadius: 25, overflow: 'hidden', alignItems: 'center' }, tryOnLabel: { position: 'absolute', left: 12, top: 12, minHeight: 30, borderRadius: 99, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.84)', flexDirection: 'row', alignItems: 'center', gap: 5 }, tryOnLabelText: { fontSize: 11, fontWeight: '800' }, checkoutHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, checkoutEyebrow: { color: colors.purple, fontSize: 11, fontWeight: '900', letterSpacing: 0.85 }, checkoutTitle: { color: colors.ink, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7, marginTop: 2 }, checkoutPrice: { minWidth: 72, minHeight: 42, paddingHorizontal: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, checkoutPriceText: { color: colors.ink, fontSize: 14, fontWeight: '900' }, checkoutDescription: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 7 }, lockerSelect: { minHeight: 54, borderRadius: 17, paddingHorizontal: 13, backgroundColor: '#F0F3ED', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 9 }, lockerSelectOpen: { borderColor: colors.outline, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }, lockerSelectText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }, lockerPlaceholder: { color: colors.inkMuted, fontWeight: '500' }, lockerMenu: { marginTop: 5, borderRadius: 17, padding: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(23,53,42,0.1)', overflow: 'hidden' }, lockerOption: { minHeight: 48, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }, lockerOptionText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, lockerAddress: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 }, checkoutNotice: { minHeight: 46, borderRadius: 15, paddingHorizontal: 11, backgroundColor: '#EEF3EB', flexDirection: 'row', alignItems: 'center', gap: 8 }, checkoutNoticeText: { flex: 1, color: colors.inkMuted, fontSize: 12, lineHeight: 17 }, confirmSlider: { width: '100%', height: 58, borderRadius: 19, padding: 4, backgroundColor: '#E6EAE4', justifyContent: 'center', overflow: 'hidden' }, confirmSliderDisabled: { opacity: 0.48 }, confirmSliderText: { color: colors.inkMuted, fontSize: 13, fontWeight: '800', textAlign: 'center', paddingLeft: 48 }, confirmKnob: { position: 'absolute', left: 4, width: 54, height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 }, sliderHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' }, charityCheckout: { paddingTop: 35, paddingBottom: 8, gap: 14, alignItems: 'center' }, charityHeroIcon: { width: 92, height: 92, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, charityDescription: { textAlign: 'center', maxWidth: 500 }, impactRow: { width: '100%', flexDirection: 'row', gap: 7, marginVertical: 6 }, impactPill: { flex: 1, minHeight: 45, borderRadius: 15, backgroundColor: '#F0F3ED', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, impactPillText: { color: colors.ink, fontSize: 11, fontWeight: '700' }, successPane: { minHeight: 440, paddingTop: 78, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, successIcon: { width: 82, height: 82, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, successTitle: { color: colors.ink, fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 18 }, successText: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 430, marginTop: 8 }, doneButton: { width: '100%', minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 26 }, doneButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, confettiLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' }, confettiPiece: { position: 'absolute', width: 8, height: 14, borderRadius: 3 },
  mapPage: { flex: 1, overflow: 'hidden' }, mapTopFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 122 }, mapControls: { position: 'absolute', top: 14, left: 14, right: 14, gap: 9, alignItems: 'center' }, tasksControlRow: { width: '100%', maxWidth: 500, flexDirection: 'row', alignItems: 'center', gap: 8 }, mapTitle: { color: colors.ink, fontSize: 32, lineHeight: 35, fontWeight: '900', letterSpacing: -1 }, locateButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(240,244,238,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, overflow: 'hidden' }, tasksTabs: { flex: 1, minHeight: 48, padding: 4, borderRadius: 20, backgroundColor: 'rgba(233,239,231,0.92)', flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: 'rgba(23,53,42,0.08)', shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5, overflow: 'hidden' }, tasksTab: { flex: 1, minHeight: 38, borderRadius: 15, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'transparent' }, tasksTabText: { color: colors.inkMuted, backgroundColor: 'transparent', fontSize: 14, fontWeight: '800' }, tasksTabTextActive: { color: '#FFFFFF', backgroundColor: 'transparent' }, mapLegend: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(238,243,236,0.92)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(23,53,42,0.06)' }, legendDot: { width: 9, height: 9, borderRadius: 99 }, legendSquare: { width: 9, height: 9, borderRadius: 3 }, legendText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800', marginRight: 2 }, taskSheet: { position: 'absolute', left: 13, right: 13, bottom: 96, height: 196, borderRadius: 28, padding: 14, gap: 9 }, sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CFD3CC', alignSelf: 'center', marginTop: -5 }, taskSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, taskSheetTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, taskSheetSub: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, questCount: { minWidth: 30, height: 30, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, questCountText: { color: colors.ink, fontSize: 12, fontWeight: '900' }, questBoard: { gap: 8, paddingRight: 4 }, questCard: { minHeight: 106, borderRadius: 20, padding: 12, backgroundColor: 'rgba(250,252,249,0.92)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', overflow: 'hidden' }, completedTask: { opacity: 0.58 }, questCardCompact: { width: 246, minHeight: 106 }, questCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, questPoints: { minHeight: 25, borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#E8F3E8', flexDirection: 'row', alignItems: 'center', gap: 3 }, questPointsText: { color: colors.forest, fontSize: 11, fontWeight: '900' }, questSource: { maxWidth: 128, minHeight: 25, borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#F0EBFF', flexDirection: 'row', alignItems: 'center', gap: 4 }, questSourceText: { flexShrink: 1, color: colors.purple, fontSize: 10, fontWeight: '800' }, questTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 8 }, questDescription: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, tasksListPage: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', paddingTop: 20, paddingHorizontal: 16, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', backgroundColor: 'rgba(247,250,245,0.97)', borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.9)' }, tasksListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, taskPanelTitle: { color: colors.ink, fontSize: 25, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6 }, tasksScroll: { gap: 12, paddingBottom: 112 }, taskSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }, taskSectionSub: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, dailyQuestList: { gap: 8 }, eventList: { gap: 8 }, eventCard: { minHeight: 90, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }, eventBadge: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, eventBadgePoints: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, eventBadgeLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 8, fontWeight: '900' }, eventStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 5 }, eventStatusDot: { width: 7, height: 7, borderRadius: 99 }, eventStatusText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' }, eventTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 4 }, eventMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, submissionCard: { minHeight: 66, borderRadius: 19, padding: 9, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden' }, submissionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, livePill: { minHeight: 30, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }, liveText: { color: colors.ink, fontSize: 11, fontWeight: '900' }, nearbyTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, nearbyMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 }, distance: { color: colors.forest, fontSize: 11, fontWeight: '900' }, taskModal: { flex: 1, justifyContent: 'flex-end' }, taskComposer: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, paddingBottom: 30, gap: 12, borderTopLeftRadius: 31, borderTopRightRadius: 31, backgroundColor: '#FCFDF9', overflow: 'hidden' }, taskComposerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, taskComposerTitle: { color: colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', marginTop: 3 }, taskInput: { minHeight: 52, borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#EFF2EC', color: colors.ink, fontFamily: 'GoogleSansFlex', fontSize: 15 }, taskDescription: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' }, photoEvidence: { height: 135, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E8EEE5', alignItems: 'center', justifyContent: 'center', gap: 7 }, photoEvidenceText: { color: colors.ink, fontSize: 13, fontWeight: '800' }, aiNotice: { minHeight: 54, borderRadius: 17, padding: 11, backgroundColor: '#F2EDFF', flexDirection: 'row', alignItems: 'center', gap: 9 }, aiNoticeText: { flex: 1, color: colors.inkMuted, fontSize: 11, lineHeight: 16 }, taskSubmit: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, taskSubmitText: { color: '#FFFFFF', backgroundColor: 'transparent', fontSize: 15, fontWeight: '900' }, eventDetailSheet: { width: '100%', maxWidth: 680, alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', backgroundColor: '#FCFDF9' }, eventDetailHero: { position: 'relative', minHeight: 116, paddingHorizontal: 20, paddingTop: 30, paddingBottom: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, eventSheetHandle: { position: 'absolute', top: 10, left: '50%', width: 38, height: 4, marginLeft: -19, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.72)' }, eventDetailEyebrow: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, eventDetailPoints: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, eventDetailContent: { padding: 20, paddingBottom: 30, gap: 14 }, eventDetailTitle: { color: colors.ink, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7 }, eventDetailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, eventDetailMeta: { flex: 1, color: colors.inkMuted, fontSize: 14, lineHeight: 20 }, emptyState: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 22 },
  roundButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, inviteCard: { minHeight: 134, borderRadius: 27, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 14 }, qrCode: { width: 94, height: 94, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, inviteTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, inviteText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }, copyLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }, copyLinkText: { fontSize: 12, fontWeight: '900' }, friendList: { gap: 8, paddingBottom: 104 }, friendEmpty: { minHeight: 74, borderRadius: 21, padding: 11, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', gap: 11 }, friendEmptyIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, friendEmptyCopy: { flex: 1, minWidth: 0 }, friendEmptyTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' }, friendEmptyText: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, friendRow: { minHeight: 92, borderRadius: 22, padding: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, friendInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }, friendAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, friendInitial: { color: colors.ink, fontSize: 18, fontWeight: '900' }, friendCopy: { flex: 1, minWidth: 0 }, friendName: { color: colors.ink, fontSize: 14, fontWeight: '900' }, friendPlushieLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, friendPlushieName: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' }, friendAccessories: { flexDirection: 'row', gap: 3 }, friendBadge: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, friendProgress: { color: colors.inkMuted, fontSize: 10, marginTop: 5 }, friendActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, questButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, moreButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(230,234,226,0.8)', alignItems: 'center', justifyContent: 'center' },
  settingsPageContent: { gap: 12, paddingBottom: 104 }, profileCard: { minHeight: 92, borderRadius: 25, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, profileAvatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: colors.ink, fontSize: 20, fontWeight: '900' }, profileName: { color: colors.ink, fontSize: 16, fontWeight: '900' }, profileEmail: { color: colors.inkMuted, fontSize: 12, marginTop: 3 }, editButton: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.58)', alignItems: 'center', justifyContent: 'center' }, editText: { fontSize: 11, fontWeight: '900' }, settingsList: { gap: 7 }, settingRow: { minHeight: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.62)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }, settingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(230,234,226,0.7)', alignItems: 'center', justifyContent: 'center' }, settingLabel: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '900' }, accountActions: { flexDirection: 'row', gap: 8 }, signOutButton: { flex: 1, minHeight: 50, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.68)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, signOutText: { color: colors.ink, fontSize: 14, fontWeight: '900' }, deleteButton: { flex: 1, minHeight: 50, borderRadius: 17, backgroundColor: '#FFE9E6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, deleteText: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  creditsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 }, creditsBack: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, creditsIntro: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: -2 }, creditsList: { gap: 8, paddingBottom: 104 }, creditRow: { minHeight: 84, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, notificationRow: { minHeight: 78, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(23,53,42,0.07)' }, toggleTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: '#D7DDD5' }, toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 3 }, toggleKnobOn: { transform: [{ translateX: 20 }] }, creditMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(223,252,140,0.48)' }, creditCopy: { flex: 1, minWidth: 0 }, creditName: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' }, creditDetail: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }, creditLicense: { color: colors.forest, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 3 }, creditsFootnote: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, paddingTop: 8 },
  navWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 86, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, zIndex: 20 }, navShadow: { flex: 1, borderRadius: 26, shadowColor: colors.shadow, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10, backgroundColor: 'transparent' }, navClip: { flex: 1, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)', backgroundColor: 'rgba(233,239,231,0.78)' }, navRow: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 3, gap: 2 }, navItem: { flex: 1, minHeight: 62, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: 'transparent' }, navIconWrap: { width: 44, height: 31, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, navText: { color: colors.inkMuted, backgroundColor: 'transparent', fontSize: 10, fontWeight: '600' }, navTextActive: { color: colors.ink, backgroundColor: 'transparent', fontWeight: '800' },
});
