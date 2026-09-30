import { Canvas } from '@react-three/fiber';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessoryId } from '../types';
import { AccessoryWorld } from './AccessoryModel3D';

export const AccessoryPreview3D = memo(function AccessoryPreview3D({ id }: { id: AccessoryId }) {
  return <View style={styles.wrap}><Canvas camera={{ position: [0, 0, 4.2], fov: 36 }} dpr={1} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}><AccessoryWorld id={id} animate={false} /></Canvas></View>;
});

const styles = StyleSheet.create({ wrap: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' } });
