import { Canvas } from '@react-three/fiber';
import { StyleSheet, View } from 'react-native';
import { AccessoryId } from '../types';
import { BearWorld } from './BearModel3D';

export function PlushieScene({ accessories, manualRotation, isInteracting, autoRotate }: { accessories: AccessoryId[]; manualRotation?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Canvas camera={{ position: [0, 0.1, 5.7], fov: 38 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true }}>
        <BearWorld accessories={accessories} manualRotation={manualRotation} isInteracting={isInteracting} autoRotate={autoRotate} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, width: '100%', pointerEvents: 'none' } });
