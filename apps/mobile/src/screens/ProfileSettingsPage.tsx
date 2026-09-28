import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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

  return <View style={styles.page}><View style={styles.header}><Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={[styles.back, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}><Ionicons name="arrow-back" size={21} color={palette.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: palette.deep }]}>YOUR IDENTITY</Text><Text style={[styles.title, { color: palette.onSurface }]}>Profile</Text></View></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={[styles.photoCard, { backgroundColor: palette.surfaceBright, borderColor: palette.outlineVariant }]}><Pressable onPress={() => void choosePhoto()} accessibilityRole="button" accessibilityLabel="Change profile picture">{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: palette.primary }]}><Text style={[styles.initial, { color: palette.onPrimary }]}>{name[0] || '?'}</Text></View>}<View style={[styles.photoBadge, { backgroundColor: palette.deep }]}><Ionicons name="camera" size={14} color="#FFFFFF" /></View></Pressable><Pressable onPress={() => setAvatarDataUrl(null)}><Text style={[styles.remove, { color: palette.deep }]}>Remove photo</Text></Pressable></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Public profile</Text><TextInput value={name} onChangeText={setName} placeholder="Display name" style={inputStyle} /><TextInput value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Username" style={inputStyle} /><Pressable disabled={busy !== null || !name.trim() || !username.trim()} onPress={() => void saveProfile()} style={[styles.primary, { backgroundColor: palette.deep }]}><Text style={styles.primaryText}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</Text></Pressable></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Password</Text><TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Current password" style={inputStyle} /><TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="New password" style={inputStyle} /><TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Confirm new password" style={inputStyle} /><View style={styles.rules}>{PASSWORD_REQUIREMENTS.map((requirement) => <Text key={requirement.key} style={[styles.rule, requirement.test(newPassword) && { color: palette.success }]}>{requirement.test(newPassword) ? '✓' : '○'} {requirement.label}</Text>)}<Text style={[styles.rule, Boolean(confirmPassword && newPassword === confirmPassword) && { color: palette.success }]}>{confirmPassword && newPassword === confirmPassword ? '✓' : '○'} Passwords match</Text></View><Pressable disabled={busy !== null || !isStrongPassword(newPassword) || newPassword !== confirmPassword} onPress={() => void savePassword()} style={[styles.primary, { backgroundColor: palette.deep }]}><Text style={styles.primaryText}>{busy === 'password' ? 'Updating…' : 'Change password'}</Text></Pressable></View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.onSurface }]}>Linked accounts</Text>{(['google', 'discord', 'microsoft'] as OAuthProvider[]).map((provider) => <Pressable key={provider} disabled={busy !== null || linked(provider)} onPress={() => void link(provider)} style={[styles.account, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceBright }]}><Ionicons name={provider === 'google' ? 'logo-google' : provider === 'discord' ? 'logo-discord' : 'logo-windows'} size={20} color={palette.deep} /><Text style={[styles.accountName, { color: palette.onSurface }]}>{provider.charAt(0).toUpperCase()}{provider.slice(1)}</Text><Text style={[styles.accountStatus, { color: linked(provider) ? palette.success : palette.deep }]}>{linked(provider) ? 'Linked' : busy === provider ? 'Opening…' : 'Link'}</Text></Pressable>)}</View>
  </ScrollView></View>;
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
  remove: { fontSize: 12, fontWeight: '800' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  input: { minHeight: 52, borderRadius: 17, borderWidth: 1, paddingHorizontal: 15, fontFamily: 'GoogleSansFlex', fontSize: 14 },
  primary: { minHeight: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', opacity: 1 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  rules: { gap: 5, paddingHorizontal: 4 },
  rule: { color: '#66736D', fontSize: 11, lineHeight: 15 },
  account: { minHeight: 54, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountName: { flex: 1, fontSize: 14, fontWeight: '800' },
  accountStatus: { fontSize: 12, fontWeight: '900' },
});
