import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getAuthProviders } from '../api';
import { AccessoryColorScheme } from '../dynamicTheme';
import { isStrongPassword, PASSWORD_REQUIREMENTS } from '../password';
import { OAuthProvider, User } from '../types';
import { Text } from '../components/Typography';

type Props = {
  user: User;
  palette: AccessoryColorScheme;
  onBack: () => void;
  onUpdateProfile: (input: { name: string; username: string; avatarDataUrl?: string | null }) => Promise<User>;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  onLinkAccount: (provider: OAuthProvider) => Promise<User>;
};

export function ProfileSettingsPage({ user, palette, onBack, onUpdateProfile, onChangePassword, onLinkAccount }: Props) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(user.avatarDataUrl);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState(user.linkedAccounts);
  const [providerAvailability, setProviderAvailability] = useState<Record<OAuthProvider, boolean> | null>(null);

  useEffect(() => {
    let active = true;
    getAuthProviders().then((availability) => { if (active) setProviderAvailability(availability); }).catch(() => { if (active) setProviderAvailability({ google: false, discord: false, microsoft: false }); });
    return () => { active = false; };
  }, []);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo access needed', 'Allow photo access to choose a profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.uri) return;
    const resized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 512, height: 512 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (resized.base64) setAvatarDataUrl(`data:image/jpeg;base64,${resized.base64}`);
  };

  const saveProfile = async () => {
    setBusy('profile');
    try {
      await onUpdateProfile({ name: name.trim(), username: username.trim(), avatarDataUrl });
      Alert.alert('Profile updated', 'Your novo profile is now in sync.');
    } catch (reason) {
      Alert.alert('Could not update profile', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(null); }
  };

  const savePassword = async () => {
    if (!isStrongPassword(newPassword)) return Alert.alert('Password needs more work', 'Meet every password requirement before saving.');
    if (newPassword !== confirmPassword) return Alert.alert('Passwords do not match', 'Enter the same new password twice.');
    setBusy('password');
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Password updated', 'Use your new password next time you sign in.');
    } catch (reason) {
      Alert.alert('Could not update password', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(null); }
  };

  const link = async (provider: OAuthProvider) => {
    setBusy(provider);
    try {
      const updated = await onLinkAccount(provider);
      setLinkedAccounts(updated.linkedAccounts);
      Alert.alert('Account linked', `${provider.charAt(0).toUpperCase()}${provider.slice(1)} is now linked to novo.`);
    } catch (reason) {
      Alert.alert('Could not link account', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(null); }
  };
  const linked = (provider: OAuthProvider) => linkedAccounts.some((account) => account.provider === provider);
  const inputStyle = [styles.input, { color: palette.onSurface, borderColor: palette.outlineVariant, backgroundColor: palette.surfaceBright }];
  const visibleProviders = (['google', 'discord', 'microsoft'] as OAuthProvider[]).filter((provider) => linked(provider) || providerAvailability?.[provider]);

  return <View style={styles.page}><View style={styles.header}><Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={[styles.back, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}><Ionicons name="arrow-back" size={21} color={palette.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.deep }]}>YOUR IDENTITY</Text><Text style={[styles.title, { color: palette.onSurface }]}>Profile</Text></View></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={[styles.photoCard, { backgroundColor: palette.surfaceBright, borderColor: palette.outlineVariant }]}><Pressable onPress={() => void choosePhoto()} accessibilityRole="button" accessibilityLabel="Change profile picture">{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: palette.primary }]}><Text style={[styles.initial, { color: palette.onPrimary }]}>{name[0]?.toUpperCase() || '?'}</Text></View>}<View style={[styles.photoBadge, { backgroundColor: palette.deep }]}><Ionicons name="camera" size={14} color="#FFFFFF" /></View></Pressable>{avatarDataUrl ? <Pressable onPress={() => setAvatarDataUrl(null)} accessibilityRole="button" accessibilityLabel="Remove profile photo" style={styles.removeButton}><Text style={[styles.remove, { color: palette.deep }]}>Remove photo</Text></Pressable> : <Text style={[styles.photoHint, { color: palette.onSurfaceVariant }]}>Tap to add a profile photo</Text>}</View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Public profile</Text><LabeledInput label="Display name" value={name} onChangeText={setName} autoCapitalize="words" palette={palette} inputStyle={inputStyle} /><LabeledInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" palette={palette} inputStyle={inputStyle} /><Pressable disabled={busy !== null || !name.trim() || !username.trim()} accessibilityRole="button" accessibilityState={{ disabled: busy !== null || !name.trim() || !username.trim() }} onPress={() => void saveProfile()} style={[styles.primary, { backgroundColor: palette.deep }, (busy !== null || !name.trim() || !username.trim()) && styles.disabled]}><Text style={styles.primaryText}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</Text></Pressable></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Password</Text><Text style={[styles.sectionHint, { color: palette.onSurfaceVariant }]}>If you joined with a social account, leave the current password blank to create one.</Text><LabeledInput label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secure palette={palette} inputStyle={inputStyle} /><LabeledInput label="New password" value={newPassword} onChangeText={setNewPassword} secure palette={palette} inputStyle={inputStyle} /><LabeledInput label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secure palette={palette} inputStyle={inputStyle} /><View style={styles.rules}>{PASSWORD_REQUIREMENTS.map((requirement) => <Text key={requirement.key} style={[styles.rule, { color: palette.onSurfaceVariant }, requirement.test(newPassword) && { color: palette.success }]}>{requirement.test(newPassword) ? '✓' : '○'} {requirement.label}</Text>)}<Text style={[styles.rule, { color: palette.onSurfaceVariant }, Boolean(confirmPassword && newPassword === confirmPassword) && { color: palette.success }]}>{confirmPassword && newPassword === confirmPassword ? '✓' : '○'} Passwords match</Text></View><Pressable disabled={busy !== null || !isStrongPassword(newPassword) || newPassword !== confirmPassword} accessibilityRole="button" accessibilityState={{ disabled: busy !== null || !isStrongPassword(newPassword) || newPassword !== confirmPassword }} onPress={() => void savePassword()} style={[styles.primary, { backgroundColor: palette.deep }, (busy !== null || !isStrongPassword(newPassword) || newPassword !== confirmPassword) && styles.disabled]}><Text style={styles.primaryText}>{busy === 'password' ? 'Updating…' : 'Change password'}</Text></Pressable></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Linked accounts</Text>{providerAvailability === null ? <Text style={[styles.sectionHint, { color: palette.onSurfaceVariant }]}>Checking available sign-in providers…</Text> : null}{visibleProviders.map((provider) => <Pressable key={provider} disabled={busy !== null || linked(provider)} accessibilityRole="button" accessibilityState={{ disabled: busy !== null || linked(provider) }} onPress={() => void link(provider)} style={[styles.account, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceBright }, (busy !== null || linked(provider)) && styles.accountDisabled]}><Ionicons name={provider === 'google' ? 'logo-google' : provider === 'discord' ? 'logo-discord' : 'logo-windows'} size={20} color={palette.deep} /><Text style={[styles.accountName, { color: palette.onSurface }]}>{provider.charAt(0).toUpperCase()}{provider.slice(1)}</Text><Text style={[styles.accountStatus, { color: linked(provider) ? palette.success : palette.deep }]}>{linked(provider) ? 'Linked' : busy === provider ? 'Opening…' : 'Link'}</Text></Pressable>)}{providerAvailability !== null && !visibleProviders.length ? <Text style={[styles.sectionHint, { color: palette.onSurfaceVariant }]}>No social sign-in providers are available right now.</Text> : null}</View>
  </ScrollView></View>;
}

function LabeledInput({ label, value, onChangeText, secure, autoCapitalize, palette, inputStyle }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; autoCapitalize?: 'none' | 'words'; palette: AccessoryColorScheme; inputStyle: object[] }) {
  const [hidden, setHidden] = useState(Boolean(secure));
  return <View style={styles.fieldGroup}><Text style={[styles.fieldLabel, { color: palette.onSurface }]}>{label}</Text><View style={styles.inputWrap}><TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure && hidden} autoCapitalize={autoCapitalize ?? 'none'} autoCorrect={false} accessibilityLabel={label} autoComplete={secure ? 'password' : label === 'Username' ? 'username' : 'name'} textContentType={secure ? 'password' : label === 'Username' ? 'username' : 'name'} style={[inputStyle, secure && styles.inputWithAction]} />{secure ? <Pressable onPress={() => setHidden((current) => !current)} accessibilityRole="button" accessibilityLabel={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`} style={styles.inputAction}><Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={palette.onSurfaceVariant} /></Pressable> : null}</View></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -1 },
  content: { gap: 18, paddingBottom: 120 },
  photoCard: { borderRadius: 24, borderWidth: 1, padding: 18, alignItems: 'center', gap: 9 },
  photo: { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 34, fontWeight: '900' },
  photoBadge: { position: 'absolute', right: -5, bottom: -5, width: 31, height: 31, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  photoHint: { fontSize: 12, lineHeight: 16 },
  removeButton: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  remove: { fontSize: 12, fontWeight: '800' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  sectionHint: { fontSize: 12, lineHeight: 17 },
  fieldGroup: { gap: 6 },
  fieldLabel: { marginLeft: 2, fontSize: 13, fontWeight: '800' },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: { minHeight: 52, borderRadius: 17, borderWidth: 1, paddingHorizontal: 15, fontFamily: 'GoogleSansFlex', fontSize: 14 },
  inputWithAction: { paddingRight: 54 },
  inputAction: { position: 'absolute', right: 3, width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', opacity: 1 },
  disabled: { opacity: 0.46 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  rules: { gap: 5, paddingHorizontal: 4 },
  rule: { color: '#66736D', fontSize: 11, lineHeight: 15 },
  account: { minHeight: 54, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountName: { flex: 1, fontSize: 14, fontWeight: '800' },
  accountStatus: { fontSize: 12, fontWeight: '900' },
  accountDisabled: { opacity: 0.72 },
});
