import { Canvas } from '@react-three/fiber/native';
import { StyleSheet, View } from 'react-native';
import { AccessoryId } from '../types';
import { BearWorld } from './BearModel3D';

export function PlushieScene({ accessories, manualRotation, isInteracting, autoRotate }: { accessories: AccessoryId[]; manualRotation?: number; isInteracting?: boolean; autoRotate?: boolean }) {
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
      <Canvas camera={{ position: [0, 0.1, 5.7], fov: 38 }} onCreated={normalizeExpoGlLogs}>
        <BearWorld accessories={accessories} manualRotation={manualRotation} isInteracting={isInteracting} autoRotate={autoRotate} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, width: '100%', pointerEvents: 'none' } });
