import { Canvas } from '@react-three/fiber';
import { StyleSheet, View } from 'react-native';
import { AccessoryId } from '../types';
import { AccessoryWorld } from './AccessoryModel3D';

export function AccessoryPreview3D({ id }: { id: AccessoryId }) {
  return <View style={styles.wrap}><Canvas camera={{ position: [0, 0, 4.2], fov: 36 }} dpr={[1, 1.35]} gl={{ alpha: true, antialias: true }}><AccessoryWorld id={id} /></Canvas></View>;
}

const styles = StyleSheet.create({ wrap: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' } });
