import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Text } from '../components/Typography';
import { colors } from '../theme';

type Props = { onClose: () => void; onScanned: (code: string) => Promise<void> };

export function AccessoryScanScreen({ onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const finish = async (code: string) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    setError('');
    try {
      await onScanned(code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not add this accessory. Try again.');
      setScanned(false);
      setLoading(false);
    }
  };
  const canUseCamera = permission?.granted;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.header}><Pressable onPress={onClose} style={styles.iconButton} accessibilityLabel="Close scanner"><Ionicons name="close" size={24} color="#FFFFFF" /></Pressable><Text style={styles.headerTitle}>Pair an accessory</Text><View style={styles.iconPlaceholder} /></View>
        <View style={styles.scanner}>
          {canUseCamera ? <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : ({ data }) => finish(data)} /> : <View style={styles.cameraFallback}><View style={styles.patternOne} /><View style={styles.patternTwo} /><Ionicons name="qr-code-outline" size={64} color="#D8E3DC" /></View>}
          <View style={styles.frame}><View style={[styles.corner, styles.cornerTL]} /><View style={[styles.corner, styles.cornerTR]} /><View style={[styles.corner, styles.cornerBL]} /><View style={[styles.corner, styles.cornerBR]} /><View style={styles.scanLine} /></View>
          <View style={styles.hint}><Ionicons name="sparkles" size={17} color={colors.ink} /><Text style={styles.hintText}>Line up the QR code on the accessory tag</Text></View>
        </View>
        <View style={styles.sheet}>
          <Text style={styles.title}>Make it theirs, forever</Text><Text style={styles.body}>Each code works once. After scanning, this accessory stays in your collection and can be equipped anytime.</Text>
          {!canUseCamera && !permission?.canAskAgain ? <Text style={styles.permissionText}>Camera access is off. Enable it in your device settings to scan a code.</Text> : !canUseCamera ? <Button label="Allow camera" icon="camera-outline" onPress={requestPermission} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loading ? <Text style={styles.loadingText}>Adding this verified accessory to your wardrobe…</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#13231D' }, page: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#13231D' },
  header: { height: 70, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, iconButton: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }, iconPlaceholder: { width: 42 },
  scanner: { flex: 1, minHeight: 380, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, cameraFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#263A32', alignItems: 'center', justifyContent: 'center' }, patternOne: { position: 'absolute', width: 280, height: 280, borderRadius: 100, backgroundColor: '#304A3F', left: -90, top: 20, transform: [{ rotate: '22deg' }] }, patternTwo: { position: 'absolute', width: 250, height: 190, borderRadius: 100, backgroundColor: '#21342C', right: -70, bottom: 10 },
  frame: { width: 248, height: 248, position: 'relative' }, corner: { position: 'absolute', width: 52, height: 52, borderColor: colors.limeBright }, cornerTL: { left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 24 }, cornerTR: { right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 24 }, cornerBL: { left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5, borderBottomLeftRadius: 24 }, cornerBR: { right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5, borderBottomRightRadius: 24 }, scanLine: { position: 'absolute', left: 24, right: 24, top: '50%', height: 2, backgroundColor: colors.limeBright, shadowColor: colors.limeBright, shadowOpacity: 0.8, shadowRadius: 8 },
  hint: { position: 'absolute', bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.lime, paddingHorizontal: 17, paddingVertical: 12, borderRadius: 99 }, hintText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 34, borderTopRightRadius: 34, padding: 24, paddingBottom: 30, gap: 14 }, title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 }, body: { color: colors.inkMuted, fontSize: 16, lineHeight: 23, marginBottom: 4 }, permissionText: { color: colors.coral, fontSize: 14, lineHeight: 20, fontWeight: '700' }, errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' }, loadingText: { color: colors.forest, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
});
