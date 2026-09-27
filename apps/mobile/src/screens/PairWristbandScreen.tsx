import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Text } from '../components/Typography';
import { scanNovoWristbandTag } from '../nfc';
import { colors } from '../theme';
import { NovoLocation, User } from '../types';

type Props = {
  user: User;
  loadPickupLocations: () => Promise<NovoLocation[]>;
  onPair: (tagToken: string, pickupLocation: string) => Promise<User>;
  onPaired: (user: User) => void;
  onSignOut: () => void;
};

type PairState = 'ready' | 'scanning' | 'success' | 'error';

export function PairWristbandScreen({ user, loadPickupLocations, onPair, onPaired, onSignOut }: Props) {
  const [state, setState] = useState<PairState>('ready');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<NovoLocation[]>([]);
  const [pickup, setPickup] = useState('');
  const [query, setQuery] = useState('');
  const [showLocations, setShowLocations] = useState(false);
  const [pairedUser, setPairedUser] = useState<User | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadPickupLocations().then(setLocations).catch(() => setLocations([])); }, [loadPickupLocations]);
  useEffect(() => {
    if (state !== 'scanning') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, state]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.filter((location) => !needle || `${location.name} ${location.address}`.toLowerCase().includes(needle)).slice(0, 30);
  }, [locations, query]);

  const startPairing = async () => {
    if (!pickup) return setError('Choose the Pick! or POPStation where you collected your wristband.');
    setState('scanning'); setError('');
    try {
      const tagToken = await scanNovoWristbandTag();
      const paired = await onPair(tagToken, pickup);
      setPairedUser(paired);
      setState('success');
      setTimeout(() => onPaired(paired), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not read the wristband.');
      setState('error');
    }
  };

  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    <View style={styles.topbar}><Logo compact/><Pressable onPress={onSignOut} style={styles.exit}><Text style={styles.exitText}>Sign out</Text></Pressable></View>
    <View style={styles.progress}><View style={styles.progressDone}/></View>
    <View style={styles.copy}><Text style={styles.eyebrow}>COLLECT · TAP · MEET</Text><Text style={styles.title}>{state === 'success' ? `Meet ${pairedUser?.mascotName ?? user.mascotName}!` : 'Pair your wristband'}</Text><Text style={styles.subtitle}>{state === 'success' ? `${pairedUser?.mascotName ?? user.mascotName} is now your ${pairedUser?.wristbandColor.replace('-', ' ') ?? 'Novo'} ${pairedUser?.mascotType.replace('-', ' ') ?? 'animal'} companion.` : 'Choose where you collected it, then tap the NFC face to reveal your in-app animal mascot.'}</Text></View>
    <View style={styles.bandStage}><View style={styles.bandLoop}/><Animated.View style={[styles.nfcFace, state === 'scanning' && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }] }, state === 'success' && styles.successFace]}><Ionicons name={state === 'success' ? 'checkmark' : 'radio-outline'} size={36} color={colors.forest}/></Animated.View><View style={styles.colorDots}>{['#F5F3EC','#242827','#F28C43','#39A76A','#3E8FD8'].map((color) => <View key={color} style={[styles.colorDot,{backgroundColor:color}]}/>)}</View></View>
    <View style={styles.pickupBlock}><Text style={styles.pickupLabel}>Wristband collection point</Text><Pressable style={styles.pickupButton} onPress={() => setShowLocations((value) => !value)}><Ionicons name="location-outline" size={19} color={colors.forest}/><Text numberOfLines={2} style={[styles.pickupText,!pickup && styles.placeholder]}>{pickup || 'Choose Pick! or POPStation'}</Text><Ionicons name={showLocations ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted}/></Pressable>{showLocations && <View style={styles.locationMenu}><View style={styles.search}><Ionicons name="search" size={17} color={colors.inkMuted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search name, address or postal code" style={styles.searchInput}/></View><ScrollView style={styles.locationList} keyboardShouldPersistTaps="handled">{shown.map((location) => <Pressable key={location.id} style={styles.locationRow} onPress={() => { setPickup(`${location.name} · ${location.address}`); setShowLocations(false); }}><View style={{flex:1}}><Text style={styles.locationName}>{location.name}</Text><Text style={styles.locationAddress}>{location.address}</Text></View><Text style={styles.provider}>{location.kind === 'pick-locker' ? 'PICK!' : 'POP'}</Text></Pressable>)}</ScrollView></View>}</View>
    <View style={styles.footer}>{state === 'error' && <Text style={styles.error}>{error}</Text>}{Platform.OS === 'web' && <Text style={styles.webNotice}>Install the Android or iOS app to pair the NFC wristband.</Text>}<Button label={state === 'scanning' ? 'Waiting for wristband…' : state === 'success' ? 'Paired!' : Platform.OS === 'web' ? 'NFC needs the installed app' : 'Tap wristband to pair'} icon={state === 'success' ? 'checkmark-circle' : 'radio'} onPress={startPairing} loading={state === 'scanning'} disabled={state === 'success' || Platform.OS === 'web'}/><Text style={styles.help}>The animal is encoded by the wristband: Snowy White polar bear, Charcoal Black penguin, Sunset Orange fox, Tropical Green turtle, or Ocean Blue bird.</Text></View>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#FFFFFF'},page:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:20,paddingBottom:20},topbar:{height:66,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},exit:{minHeight:42,paddingHorizontal:15,borderRadius:99,backgroundColor:'#F1F4ED',justifyContent:'center'},exitText:{color:colors.inkMuted,fontWeight:'700'},progress:{height:6,borderRadius:9,backgroundColor:'#E5EAE1',overflow:'hidden'},progressDone:{width:'100%',height:'100%',backgroundColor:colors.limeBright},copy:{alignItems:'center',marginTop:18},eyebrow:{color:colors.forest,fontSize:11,fontWeight:'900',letterSpacing:1.2},title:{color:colors.ink,fontSize:32,lineHeight:38,fontWeight:'900',letterSpacing:-1,textAlign:'center',marginTop:8},subtitle:{color:colors.inkMuted,fontSize:14,lineHeight:20,textAlign:'center',maxWidth:460,marginTop:6},bandStage:{height:150,alignItems:'center',justifyContent:'center'},bandLoop:{position:'absolute',width:210,height:90,borderRadius:48,borderWidth:24,borderColor:'#DFF87E',transform:[{rotate:'-8deg'}]},nfcFace:{width:76,height:76,borderRadius:25,backgroundColor:'#FFFFFF',borderWidth:2,borderColor:colors.forest,alignItems:'center',justifyContent:'center',shadowColor:colors.shadow,shadowOpacity:.16,shadowRadius:10,elevation:5},successFace:{backgroundColor:colors.lime},colorDots:{position:'absolute',bottom:3,flexDirection:'row',gap:7},colorDot:{width:13,height:13,borderRadius:7,borderWidth:1,borderColor:'rgba(0,0,0,.12)'},pickupBlock:{zIndex:5},pickupLabel:{color:colors.ink,fontSize:13,fontWeight:'800',marginBottom:7},pickupButton:{minHeight:54,borderRadius:18,backgroundColor:'#F0F3ED',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},pickupText:{flex:1,color:colors.ink,fontSize:13,fontWeight:'700'},placeholder:{color:colors.inkMuted,fontWeight:'500'},locationMenu:{position:'absolute',left:0,right:0,top:82,maxHeight:245,borderRadius:18,padding:6,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DDE4D9',shadowColor:'#000',shadowOpacity:.14,shadowRadius:15,elevation:10},search:{minHeight:44,borderRadius:13,backgroundColor:'#F2F5EF',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,fontFamily:'GoogleSansFlex',fontSize:13,color:colors.ink},locationList:{maxHeight:185},locationRow:{minHeight:58,borderRadius:13,padding:9,flexDirection:'row',alignItems:'center',gap:8},locationName:{color:colors.ink,fontSize:12,fontWeight:'800'},locationAddress:{color:colors.inkMuted,fontSize:10,lineHeight:14,marginTop:2},provider:{color:colors.forest,fontSize:9,fontWeight:'900'},footer:{marginTop:'auto',gap:9},error:{color:colors.danger,fontSize:13,lineHeight:18,textAlign:'center',fontWeight:'700'},webNotice:{color:colors.inkMuted,fontSize:13,textAlign:'center'},help:{color:colors.inkMuted,fontSize:11,lineHeight:16,textAlign:'center'}
});
