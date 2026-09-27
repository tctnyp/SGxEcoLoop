import { Canvas } from '@react-three/fiber/native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessoryId, MascotType } from '../types';
import { MascotWorld } from './BearModel3D';

export const PlushieScene = memo(function PlushieScene({ mascotType, accessories, manualRotationX, manualRotationY, isInteracting, autoRotate, compact = false }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean; compact?: boolean }) {
  const normalizeExpoGlLogs = ({ gl }: { gl: { getContext: () => WebGLRenderingContext } }) => {
    const context = gl.getContext();
    const shaderLog = context.getShaderInfoLog?.bind(context);
    const programLog = context.getProgramInfoLog?.bind(context);

    // Expo GL on some Android devices returns undefined here. Three.js follows the
    // browser WebGL contract and trims both values, so normalize them at the edge.
    if (shaderLog) context.getShaderInfoLog = (shader) => shaderLog(shader) ?? '';
    if (programLog) context.getProgramInfoLog = (program) => programLog(program) ?? '';
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.scaledCanvas, compact && styles.compactCanvas]}>
        <Canvas camera={{ position: [0, 0.1, 5.7], fov: 38 }} frameloop="demand" gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }} onCreated={normalizeExpoGlLogs}>
          <MascotWorld mascotType={mascotType} accessories={accessories} manualRotationX={manualRotationX} manualRotationY={manualRotationY} isInteracting={isInteracting} autoRotate={autoRotate} />
        </Canvas>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', pointerEvents: 'none', overflow: 'visible' },
  scaledCanvas: { position: 'absolute', width: '72%', height: '72%', left: '14%', top: '14%', transform: [{ scale: 1.38 }] },
  compactCanvas: { width: '62%', height: '62%', left: '19%', top: '19%', transform: [{ scale: 1.16 }] },
});
