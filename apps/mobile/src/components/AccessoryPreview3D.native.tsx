import { Canvas } from '@react-three/fiber/native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessoryId } from '../types';
import { AccessoryWorld } from './AccessoryModel3D';

export const AccessoryPreview3D = memo(function AccessoryPreview3D({ id }: { id: AccessoryId }) {
  const normalizeExpoGlLogs = ({ gl }: { gl: { getContext: () => WebGLRenderingContext } }) => {
    const context = gl.getContext();
    const shaderLog = context.getShaderInfoLog?.bind(context);
    const programLog = context.getProgramInfoLog?.bind(context);
    if (shaderLog) context.getShaderInfoLog = (shader) => shaderLog(shader) ?? '';
    if (programLog) context.getProgramInfoLog = (program) => programLog(program) ?? '';
  };

  return <View style={styles.wrap}><Canvas camera={{ position: [0, 0, 4.2], fov: 36 }} frameloop="demand" gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }} onCreated={normalizeExpoGlLogs}><AccessoryWorld id={id} animate={false} /></Canvas></View>;
});

const styles = StyleSheet.create({ wrap: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' } });
