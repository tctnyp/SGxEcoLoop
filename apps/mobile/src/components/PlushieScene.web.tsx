import { Canvas } from '@react-three/fiber';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessoryId, MascotType } from '../types';
import { MascotWorld } from './BearModel3D';

export const PlushieScene = memo(function PlushieScene({ mascotType, accessories, manualRotationX, manualRotationY, isInteracting, autoRotate }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Canvas camera={{ position: [0, 0.1, 5.7], fov: 38 }} dpr={[1, 1.35]} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}>
        <MascotWorld mascotType={mascotType} accessories={accessories} manualRotationX={manualRotationX} manualRotationY={manualRotationY} isInteracting={isInteracting} autoRotate={autoRotate} />
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { flex: 1, width: '100%', pointerEvents: 'none' } });
