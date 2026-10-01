import { Canvas } from '@react-three/fiber';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessoryId, MascotType } from '../types';
import { MascotWorld } from './BearModel3D';

export const PlushieScene = memo(function PlushieScene({ mascotType, accessories, manualRotationX, manualRotationY, isInteracting, autoRotate, compact = false }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean; compact?: boolean }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.canvasFrame, compact && styles.compactFrame]}>
        <Canvas camera={{ position: [0, 0.1, 5.7], fov: 38 }} dpr={[1, 1.35]} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}>
          <MascotWorld mascotType={mascotType} accessories={accessories} manualRotationX={manualRotationX} manualRotationY={manualRotationY} isInteracting={isInteracting} autoRotate={autoRotate} />
        </Canvas>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'visible' },
  canvasFrame: { width: '100%', height: '100%' },
  compactFrame: { width: '100%', height: '100%' },
});
