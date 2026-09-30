import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Text } from '../components/Typography';
import { scanNovoWristbandTag } from '../nfc';
import { colors } from '../theme';
import { NovoLocation, User } from '../types';

type Props = {
  user: User;
  loadPickupLocations: (coordinates?: { latitude: number; longitude: number }) => Promise<NovoLocation[]>;
  onPair: (tagToken: string, pickupLocation: string) => Promise<User>;
  onReserve: (pickupLocation: string) => Promise<User>;
  onPaired: (user: User) => void;
  onSignOut: () => void;
};

type PairState = 'ready' | 'scanning' | 'success' | 'error';

export function PairWristbandScreen({ user, loadPickupLocations, onPair, onReserve, onPaired, onSignOut }: Props) {
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const [mode, setMode] = useState<'pair' | 'collect'>('pair');
  const [state, setState] = useState<PairState>('ready');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<NovoLocation[]>([]);
  const [pickup, setPickup] = useState(user.wristbandPickupLocation ?? '');
  const [query, setQuery] = useState('');
  const [showLocations, setShowLocations] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [savingPickup, setSavingPickup] = useState(false);
  const [pickupConfirmed, setPickupConfirmed] = useState(Boolean(user.wristbandPickupLocation));
  const [pairedUser, setPairedUser] = useState<User | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const guide = useRef(new Animated.Value(0)).current;
  const locationsLoaded = useRef(false);

  useEffect(() => {
    if (mode !== 'collect' || locationsLoaded.current) return undefined;
    let active = true;
    const load = async () => {
      setLoadingLocations(true);
      let coordinates: { latitude: number; longitude: number } | undefined;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coordinates = current.coords;
        }
      } catch {
        // The complete directory still loads alphabetically when location is unavailable.
      }
      try {
        const nextLocations = await loadPickupLocations(coordinates);
        if (active) {
          setLocations(nextLocations);
          locationsLoaded.current = true;
        }
      } catch {
        if (active) setLocations([]);
      } finally {
        if (active) setLoadingLocations(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [loadPickupLocations, mode]);
  useEffect(() => {
    if (state !== 'scanning') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, state]);
  useEffect(() => {
    if (mode !== 'pair' || state === 'success') return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(guide, { toValue: 1, duration: 1650, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(guide, { toValue: 0, duration: 1250, useNativeDriver: true }),
      Animated.delay(450),
    ]));
    animation.start();
    return () => animation.stop();
  }, [guide, mode, state]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.filter((location) => !needle || `${location.name} ${location.address}`.toLowerCase().includes(needle)).slice(0, 30);
  }, [locations, query]);

  const startPairing = async () => {
    setState('scanning'); setError('');
    try {
      const tagToken = await scanNovoWristbandTag();
      const paired = await onPair(tagToken, pickup || user.wristbandPickupLocation || '');
      setPairedUser(paired);
      setState('success');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'We could not read the wristband.';
      setError(message);
      setState('error');
    }
  };

  const reservePickup = async () => {
    if (!pickup) return setError('Choose a Pick! Locker or POPStation first.');
    setSavingPickup(true); setError('');
    try {
      await onReserve(pickup);
      setPickupConfirmed(true);
      setMode('pair');
      setShowLocations(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not save this collection point.');
    } finally {
      setSavingPickup(false);
    }
  };

  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    <View style={styles.topbar}><Logo compact/><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: colors.inkMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>WRISTBAND · 2 OF 3</Text><Pressable onPress={onSignOut} style={styles.exit}><Text style={styles.exitText}>Sign out</Text></Pressable></View></View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 3, now: 2, text: 'Wristband setup, step 2 of 3' }} style={styles.progress}><View style={[styles.progressDone, { width: '66.667%' }]}/></View>
    <View style={styles.copy}><Text style={styles.eyebrow}>{mode === 'pair' ? 'TAP · PAIR · MEET' : 'CHOOSE · COLLECT · RETURN'}</Text><Text style={styles.title}>{state === 'success' ? 'Wristband paired!' : mode === 'pair' ? 'Pair your wristband' : 'Choose a collection point'}</Text><Text style={styles.subtitle}>{state === 'success' ? `Your ${pairedUser?.wristbandColor.replace('-', ' ') ?? 'novo'} wristband revealed a ${pairedUser?.mascotType.replace('-', ' ') ?? 'new animal'} companion. Next, give your mascot a name.` : mode === 'pair' ? 'Already have your wristband? Tap it to this phone. Pairing is required before you can enter novo.' : 'Reserve a convenient Pick! Locker or POPStation, collect your wristband, then return here to pair it.'}</Text></View>
    {mode === 'pair' ? <>
      <View style={[styles.nfcGuideStage, compact && { height: 158 }]}><View style={styles.detectionBeam} /><Animated.View style={[styles.guideWristband, { opacity: guide.interpolate({ inputRange: [0, .12, .9, 1], outputRange: [.65, 1, 1, .75] }), transform: [{ translateX: guide.interpolate({ inputRange: [0, 1], outputRange: [-124, 18] }) }, { rotate: '-9deg' }] }]}><View style={styles.guideStrap} /><View style={styles.guideModule}><Ionicons name="leaf" size={18} color={colors.forest} /></View></Animated.View><View style={styles.phoneMock}><View style={styles.phoneSpeaker} /><Animated.View style={[styles.nfcGuideFace, state === 'scanning' && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }] }, state === 'success' && styles.successFace]}><Ionicons name={state === 'success' ? 'checkmark' : 'radio-outline'} size={28} color={colors.forest}/></Animated.View><View style={styles.phoneHome} /></View><Text style={styles.guideCaption}>Move the wristband behind the top of your phone</Text></View>
      {state !== 'success' && <View style={styles.optionSummary}><View style={styles.optionIcon}><Ionicons name="radio-outline" size={21} color={colors.forest}/></View><View style={{flex:1}}><Text style={styles.optionTitle}>I have a wristband</Text><Text style={styles.optionText}>Keep it near the top of your phone while novo reads its NFC tag.</Text>{pickupConfirmed && pickup ? <Text numberOfLines={1} style={{ color: colors.forest, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 4 }}>Reserved · {pickup}</Text> : null}</View></View>}
      {state === 'success' && <View style={styles.successSummary}><Ionicons name="checkmark-circle" size={25} color={colors.forest}/><View style={{flex:1}}><Text style={styles.optionTitle}>Pairing complete</Text><Text style={styles.optionText}>This wristband is now securely linked to your novo ID. Continue to reveal and name your mascot.</Text></View></View>}
    </> : <View style={styles.collectionPage}>
      <View style={styles.collectionHero}><Ionicons name="cube-outline" size={30} color={colors.forest}/><View style={{flex:1}}><Text style={styles.optionTitle}>I need a wristband</Text><Text style={styles.optionText}>Your selected point is saved to your account. It does not unlock the app until the wristband is paired.</Text></View></View>
      <View style={styles.pickupBlock}><Text style={styles.pickupLabel}>Wristband collection point</Text><Pressable style={styles.pickupButton} onPress={() => setShowLocations((value) => !value)}><Ionicons name="location-outline" size={19} color={colors.forest}/><Text numberOfLines={2} style={[styles.pickupText,!pickup && styles.placeholder]}>{pickup || 'Choose Pick! or POPStation'}</Text><Ionicons name={showLocations ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted}/></Pressable>{showLocations && <View style={styles.locationMenu}><View style={styles.search}><Ionicons name="search" size={17} color={colors.inkMuted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search name, address or postal code" style={styles.searchInput}/></View><ScrollView style={styles.locationList} keyboardShouldPersistTaps="handled">{loadingLocations ? <View style={{ minHeight: 90, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.forest}/><Text style={styles.emptyLocations}>Loading collection points…</Text></View> : shown.map((location) => <Pressable key={location.id} style={styles.locationRow} onPress={() => { setPickup(`${location.name} · ${location.address}`); setPickupConfirmed(false); setShowLocations(false); }}><View style={{flex:1}}><Text style={styles.locationName}>{location.name}</Text><Text style={styles.locationAddress}>{location.address}</Text></View><View style={styles.locationMeta}><Text style={styles.provider}>{location.kind === 'pick-locker' ? 'PICK!' : 'POP'}</Text>{typeof location.distanceKm === 'number' && <Text style={styles.distance}>{location.distanceKm < 1 ? `${Math.round(location.distanceKm * 1000)} m` : `${location.distanceKm.toFixed(1)} km`}</Text>}</View></Pressable>)}{!loadingLocations && !shown.length && <Text style={styles.emptyLocations}>No matching collection point. Try a postal code or neighbourhood.</Text>}</ScrollView></View>}</View>
    </View>}
    <View style={styles.footer}>{error ? <Text style={styles.error}>{error}</Text> : null}{mode === 'pair' ? state === 'success' ? <Button label="Meet my mascot" icon="sparkles" onPress={() => pairedUser && onPaired(pairedUser)}/> : <>{Platform.OS === 'web' && <Text style={styles.webNotice}>Install the Android or iOS app to pair the NFC wristband.</Text>}<Button label={state === 'scanning' ? 'Waiting for wristband…' : Platform.OS === 'web' ? 'NFC needs the installed app' : 'Tap wristband to pair'} icon="radio" onPress={startPairing} loading={state === 'scanning'} disabled={Platform.OS === 'web'}/><Pressable onPress={() => { setMode('collect'); setError(''); }} style={styles.secondaryAction}><Ionicons name="location-outline" size={18} color={colors.forest}/><Text style={styles.secondaryActionText}>I don’t have a wristband</Text><Ionicons name="chevron-forward" size={17} color={colors.forest}/></Pressable><Text style={styles.help}>Pairing requires a prepared physical novo wristband. On iPhone, hold it against the top edge until the Core NFC sheet confirms the read.</Text></> : <><Button label={savingPickup ? 'Saving collection point…' : 'Save collection point'} icon="location" onPress={reservePickup} loading={savingPickup} disabled={!pickup || savingPickup}/><Pressable onPress={() => { setMode('pair'); setError(''); }} style={styles.secondaryAction}><Ionicons name="arrow-back" size={18} color={colors.forest}/><Text style={styles.secondaryActionText}>Back to wristband pairing</Text></Pressable><Text style={styles.help}>After collection, reopen novo and pair the wristband to meet your animal mascot.</Text></>}</View>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#FFFFFF'},page:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:20,paddingBottom:20},topbar:{height:66,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},exit:{minHeight:42,paddingHorizontal:15,borderRadius:99,backgroundColor:'#F1F4ED',justifyContent:'center'},exitText:{color:colors.inkMuted,fontWeight:'700'},progress:{height:6,borderRadius:9,backgroundColor:'#E5EAE1',overflow:'hidden'},progressDone:{width:'66.666%',height:'100%',backgroundColor:colors.limeBright},copy:{alignItems:'center',marginTop:12},eyebrow:{color:colors.forest,fontSize:11,fontWeight:'900',letterSpacing:1.2},title:{color:colors.ink,fontSize:32,lineHeight:38,fontWeight:'900',letterSpacing:-1,textAlign:'center',marginTop:6},subtitle:{color:colors.inkMuted,fontSize:14,lineHeight:20,textAlign:'center',maxWidth:460,marginTop:5},bandStage:{height:150,alignItems:'center',justifyContent:'center'},bandLoop:{position:'absolute',width:210,height:90,borderRadius:48,borderWidth:24,borderColor:'#DFF87E',transform:[{rotate:'-8deg'}]},nfcFace:{width:76,height:76,borderRadius:25,backgroundColor:'#FFFFFF',borderWidth:2,borderColor:colors.forest,alignItems:'center',justifyContent:'center',shadowColor:colors.shadow,shadowOpacity:.16,shadowRadius:10,elevation:5},successFace:{backgroundColor:colors.lime},colorDots:{position:'absolute',bottom:3,flexDirection:'row',gap:7},colorDot:{width:13,height:13,borderRadius:7,borderWidth:1,borderColor:'rgba(0,0,0,.12)'},pickupBlock:{zIndex:5},pickupLabel:{color:colors.ink,fontSize:13,fontWeight:'800',marginBottom:7},pickupButton:{minHeight:54,borderRadius:18,backgroundColor:'#F0F3ED',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},pickupText:{flex:1,color:colors.ink,fontSize:13,fontWeight:'700'},placeholder:{color:colors.inkMuted,fontWeight:'500'},locationMenu:{position:'absolute',left:0,right:0,top:82,maxHeight:245,borderRadius:18,padding:6,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DDE4D9',shadowColor:'#000',shadowOpacity:.14,shadowRadius:15,elevation:10},search:{minHeight:44,borderRadius:13,backgroundColor:'#F2F5EF',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,fontFamily:'GoogleSansFlex',fontSize:13,color:colors.ink},locationList:{maxHeight:185},locationRow:{minHeight:58,borderRadius:13,padding:9,flexDirection:'row',alignItems:'center',gap:8},locationName:{color:colors.ink,fontSize:12,fontWeight:'800'},locationAddress:{color:colors.inkMuted,fontSize:10,lineHeight:14,marginTop:2},provider:{color:colors.forest,fontSize:9,fontWeight:'900'},footer:{marginTop:'auto',gap:9},error:{color:colors.danger,fontSize:13,lineHeight:18,textAlign:'center',fontWeight:'700'},webNotice:{color:colors.inkMuted,fontSize:13,textAlign:'center'},help:{color:colors.inkMuted,fontSize:11,lineHeight:16,textAlign:'center'}
  ,optionSummary:{minHeight:72,borderRadius:22,padding:12,backgroundColor:'#F4F7F1',borderWidth:1,borderColor:'#E0E7DC',flexDirection:'row',alignItems:'center',gap:11}
  ,successSummary:{minHeight:78,borderRadius:22,padding:13,backgroundColor:'#E9F7DE',borderWidth:2,borderColor:colors.forest,flexDirection:'row',alignItems:'center',gap:11}
  ,optionIcon:{width:44,height:44,borderRadius:15,backgroundColor:'#DFF88C',alignItems:'center',justifyContent:'center'}
  ,optionTitle:{color:colors.ink,fontSize:15,fontWeight:'900'}
  ,optionText:{color:colors.inkMuted,fontSize:12,lineHeight:17,marginTop:3}
  ,collectionPage:{marginTop:24,gap:18}
  ,collectionHero:{minHeight:82,borderRadius:22,padding:14,backgroundColor:'#F0F6E8',flexDirection:'row',alignItems:'center',gap:12}
  ,locationMeta:{alignItems:'flex-end',gap:3},distance:{color:colors.inkMuted,fontSize:9,fontWeight:'700'},emptyLocations:{color:colors.inkMuted,fontSize:12,lineHeight:17,padding:14,textAlign:'center'},secondaryAction:{minHeight:50,borderRadius:17,borderWidth:1,borderColor:'#DCE5D8',backgroundColor:'#F8FAF6',paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}
  ,secondaryActionText:{flex:1,color:colors.forest,fontSize:14,fontWeight:'800',textAlign:'center'}
  ,nfcGuideStage:{height:170,alignItems:'center',justifyContent:'center',overflow:'hidden'}
  ,detectionBeam:{position:'absolute',left:'50%',marginLeft:-55,top:19,width:32,height:128,borderRadius:18,backgroundColor:'rgba(223,248,126,.3)',borderWidth:1,borderColor:'rgba(34,122,98,.25)'}
  ,guideWristband:{position:'absolute',zIndex:1,width:176,height:56,alignItems:'center',justifyContent:'center'}
  ,guideStrap:{position:'absolute',width:176,height:44,borderRadius:24,borderWidth:13,borderColor:'#DFF87E'}
  ,guideModule:{width:48,height:48,borderRadius:17,backgroundColor:'#FFFFFF',borderWidth:2,borderColor:colors.forest,alignItems:'center',justifyContent:'center',shadowColor:colors.shadow,shadowOpacity:.14,shadowRadius:8,elevation:3}
  ,phoneMock:{zIndex:3,width:84,height:142,borderRadius:22,borderWidth:4,borderColor:colors.ink,backgroundColor:'#EEF3EB',alignItems:'center',justifyContent:'center',shadowColor:colors.shadow,shadowOpacity:.2,shadowRadius:12,elevation:7}
  ,phoneSpeaker:{position:'absolute',top:8,width:24,height:4,borderRadius:3,backgroundColor:colors.inkMuted}
  ,phoneHome:{position:'absolute',bottom:8,width:18,height:4,borderRadius:3,backgroundColor:'#B8C2BC'}
  ,nfcGuideFace:{width:52,height:52,borderRadius:18,backgroundColor:'#FFFFFF',borderWidth:2,borderColor:colors.forest,alignItems:'center',justifyContent:'center'}
  ,guideCaption:{position:'absolute',bottom:2,color:colors.inkMuted,fontSize:11,fontWeight:'700'}
});
