import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AccessoryId, MascotType } from '../types';

const MASCOT_COLORS: Record<MascotType, { body: string; head: string; accent: string; dark: string }> = {
  'polar-bear': { body: '#F1F2EE', head: '#FAFAF6', accent: '#DCE5E8', dark: '#26312F' },
  penguin: { body: '#242827', head: '#202423', accent: '#F5F2E8', dark: '#151918' },
  fox: { body: '#E87838', head: '#F08A45', accent: '#FFF0D9', dark: '#3A2720' },
  turtle: { body: '#4EAA72', head: '#6BC58B', accent: '#2E7451', dark: '#173B2A' },
  bird: { body: '#4B92D1', head: '#66A8DF', accent: '#D9EFFF', dark: '#1E405E' },
};

function createPlushRoughnessTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const wave = Math.sin(index * 1.73) * 18;
    const grain = ((index * 37 + Math.floor(index / size) * 19) % 31) - 15;
    const value = Math.max(150, Math.min(245, 210 + wave + grain));
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.needsUpdate = true;
  return texture;
}

function PlushMaterial({ color, texture }: { color: string; texture: THREE.Texture }) {
  return <meshPhysicalMaterial color={color} roughness={0.9} roughnessMap={texture} sheen={0.42} sheenRoughness={0.82} sheenColor={color} clearcoat={0.03} />;
}

export function MascotModel3D({ mascotType, accessories, manualRotationX = 0, manualRotationY = 0, isInteracting = false, autoRotate = true }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const lastManualRotation = useRef({ x: 0, y: 0 });
  const plushTexture = useMemo(createPlushRoughnessTexture, []);
  const star = useMemo(() => {
    const shape = new THREE.Shape();
    const spikes = 5;
    const outer = 0.32;
    const inner = 0.14;
    for (let i = 0; i < spikes * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, []);
  useEffect(() => () => plushTexture.dispose(), [plushTexture]);

  useEffect(() => {
    if (group.current) {
      // Screen-space X is the bear's horizontal turn (Three.js yaw), while
      // screen-space Y is its vertical tilt (Three.js pitch).
      group.current.rotation.y += manualRotationX - lastManualRotation.current.x;
      group.current.rotation.x += manualRotationY - lastManualRotation.current.y;
    }
    lastManualRotation.current = { x: manualRotationX, y: manualRotationY };
  }, [manualRotationX, manualRotationY]);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!autoRotate) {
      group.current.position.y = -0.08;
      return;
    }
    if (!isInteracting) group.current.rotation.y += delta * 0.32;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.25) * 0.035 - 0.08;
  });

  const has = (id: AccessoryId) => accessories.includes(id);
  const mascot = MASCOT_COLORS[mascotType];
  return (
    <group ref={group} scale={0.8}>
      <mesh position={[0, -0.55, 0]} scale={mascotType === 'penguin' ? [0.9, 1.22, 0.76] : mascotType === 'turtle' ? [1.08, 0.94, 0.78] : [1.04, 1.12, 0.74]}><sphereGeometry args={[0.96, 36, 28]} /><PlushMaterial color={mascot.body} texture={plushTexture} /></mesh>
      <mesh position={[0, mascotType === 'turtle' ? 0.62 : 0.67, 0.02]} scale={mascotType === 'bird' ? [0.92, 0.86, 0.82] : mascotType === 'fox' ? [0.98, 1.02, 0.86] : [1.04, 0.94, 0.9]}><sphereGeometry args={[1.03, 36, 28]} /><PlushMaterial color={mascot.head} texture={plushTexture} /></mesh>
      {mascotType === 'fox' ? <><mesh position={[-0.68, 1.45, -0.02]} rotation={[0,0,-.18]} scale={[.38,.58,.3]}><coneGeometry args={[1,1.8,4]}/><meshStandardMaterial color={mascot.head}/></mesh><mesh position={[0.68, 1.45, -0.02]} rotation={[0,0,.18]} scale={[.38,.58,.3]}><coneGeometry args={[1,1.8,4]}/><meshStandardMaterial color={mascot.head}/></mesh></> : mascotType === 'polar-bear' ? <><mesh position={[-0.73, 1.31, -0.02]} rotation={[0, 0, -0.22]} scale={[0.42, 0.5, 0.3]}><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color={mascot.accent} roughness={0.94} /></mesh><mesh position={[0.73, 1.31, -0.02]} rotation={[0, 0, 0.22]} scale={[0.42, 0.5, 0.3]}><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color={mascot.accent} roughness={0.94} /></mesh></> : null}
      <mesh position={[-0.74, -0.48, 0.02]} rotation={[0, 0, -0.42]} scale={[0.36, 0.82, 0.36]}><capsuleGeometry args={[0.6, 0.7, 8, 16]} /><PlushMaterial color={mascot.body} texture={plushTexture} /></mesh>
      <mesh position={[0.74, -0.48, 0.02]} rotation={[0, 0, 0.42]} scale={[0.36, 0.82, 0.36]}><capsuleGeometry args={[0.6, 0.7, 8, 16]} /><PlushMaterial color={mascot.body} texture={plushTexture} /></mesh>
      <mesh position={[-0.55, -1.42, 0.28]} rotation={[0.28, 0, -0.13]} scale={[0.62, 0.48, 0.82]}><sphereGeometry args={[0.72, 28, 20]} /><PlushMaterial color={mascot.body} texture={plushTexture} /></mesh>
      <mesh position={[0.55, -1.42, 0.28]} rotation={[0.28, 0, 0.13]} scale={[0.62, 0.48, 0.82]}><sphereGeometry args={[0.72, 28, 20]} /><PlushMaterial color={mascot.body} texture={plushTexture} /></mesh>
      <mesh position={[0, 0.42, 0.82]} scale={[0.58, 0.42, 0.24]}><sphereGeometry args={[0.74, 28, 20]} /><PlushMaterial color={mascot.accent} texture={plushTexture} /></mesh>
      {mascotType === 'bird' || mascotType === 'penguin' ? <mesh position={[0, 0.59, 1.08]} rotation={[Math.PI / 2,0,0]} scale={[.18,.28,.18]}><coneGeometry args={[1,1,4]}/><meshStandardMaterial color="#F4A43A"/></mesh> : <mesh position={[0, 0.61, 1.02]} scale={[0.16, 0.11, 0.1]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={mascot.dark} roughness={0.4} /></mesh>}
      <mesh position={[-0.37, 0.88, 0.87]} scale={[0.095, 0.12, 0.07]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={mascot.dark} roughness={0.28} /></mesh>
      <mesh position={[0.37, 0.88, 0.87]} scale={[0.095, 0.12, 0.07]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={mascot.dark} roughness={0.28} /></mesh>
      {mascotType === 'turtle' && <mesh position={[0,-0.55,-0.55]} scale={[0.88,1.02,0.34]}><sphereGeometry args={[1,28,20]}/><meshStandardMaterial color="#276A47" roughness={0.8}/></mesh>}
      {mascotType === 'penguin' && <mesh position={[0,-0.45,0.68]} scale={[0.63,0.9,0.18]}><sphereGeometry args={[0.8,24,18]}/><meshStandardMaterial color="#F5F2E8" roughness={0.9}/></mesh>}
      {mascotType === 'fox' && <group><mesh position={[0,0.55,0.92]} scale={[0.5,0.34,0.16]}><sphereGeometry args={[1,28,20]}/><PlushMaterial color="#FFF0D9" texture={plushTexture}/></mesh><mesh position={[0.92,-0.8,-0.42]} rotation={[0.1,0,-0.65]} scale={[0.38,1.12,0.38]}><capsuleGeometry args={[0.65,0.8,10,22]}/><PlushMaterial color="#E87838" texture={plushTexture}/></mesh><mesh position={[1.34,-1.2,-0.3]} rotation={[0.1,0,-0.65]} scale={[0.36,0.42,0.36]}><sphereGeometry args={[1,24,18]}/><PlushMaterial color="#FFF0D9" texture={plushTexture}/></mesh></group>}
      {mascotType === 'penguin' && <group><mesh position={[-0.92,-0.38,-0.04]} rotation={[0,0,-0.36]} scale={[0.18,0.88,0.45]}><capsuleGeometry args={[0.7,0.7,8,18]}/><PlushMaterial color="#171B1A" texture={plushTexture}/></mesh><mesh position={[0.92,-0.38,-0.04]} rotation={[0,0,0.36]} scale={[0.18,0.88,0.45]}><capsuleGeometry args={[0.7,0.7,8,18]}/><PlushMaterial color="#171B1A" texture={plushTexture}/></mesh><mesh position={[-0.48,-1.68,0.48]} scale={[0.5,0.12,0.58]}><sphereGeometry args={[1,22,16]}/><meshStandardMaterial color="#F3A733" roughness={0.72}/></mesh><mesh position={[0.48,-1.68,0.48]} scale={[0.5,0.12,0.58]}><sphereGeometry args={[1,22,16]}/><meshStandardMaterial color="#F3A733" roughness={0.72}/></mesh></group>}
      {mascotType === 'turtle' && <group><mesh position={[0,-0.5,-0.72]} scale={[1.02,1.12,0.3]}><sphereGeometry args={[1,32,24]}/><meshPhysicalMaterial color="#286C48" roughness={0.74} clearcoat={0.12}/></mesh>{[-0.48,0,0.48].map((x) => <mesh key={x} position={[x,-0.52,-1.01]} scale={[0.24,0.5,0.08]}><sphereGeometry args={[1,18,14]}/><meshStandardMaterial color="#6FB783" roughness={0.82}/></mesh>)}</group>}
      {mascotType === 'bird' && <group><mesh position={[-0.92,-0.42,0.04]} rotation={[0,0,-0.5]} scale={[0.24,0.9,0.5]}><capsuleGeometry args={[0.72,0.62,8,18]}/><PlushMaterial color="#397FBF" texture={plushTexture}/></mesh><mesh position={[0.92,-0.42,0.04]} rotation={[0,0,0.5]} scale={[0.24,0.9,0.5]}><capsuleGeometry args={[0.72,0.62,8,18]}/><PlushMaterial color="#397FBF" texture={plushTexture}/></mesh><mesh position={[0,1.58,-0.1]} rotation={[0,0,-0.2]} scale={[0.13,0.48,0.18]}><coneGeometry args={[1,1.7,5]}/><meshStandardMaterial color="#78B9E7" roughness={0.8}/></mesh><mesh position={[0,-1.42,-0.56]} rotation={[0,0,Math.PI/4]} scale={[0.46,0.62,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2E70AC" roughness={0.84}/></mesh></group>}
      {mascotType === 'polar-bear' && <group><mesh position={[-0.73,1.32,0.16]} scale={[0.2,0.24,0.08]}><sphereGeometry args={[1,20,16]}/><meshStandardMaterial color="#C9D4D8" roughness={0.95}/></mesh><mesh position={[0.73,1.32,0.16]} scale={[0.2,0.24,0.08]}><sphereGeometry args={[1,20,16]}/><meshStandardMaterial color="#C9D4D8" roughness={0.95}/></mesh></group>}
      {has('bright-star') && <mesh position={[0, -0.54, 0.79]} scale={0.92}><shapeGeometry args={[star]} /><meshStandardMaterial color="#F5E94B" emissive="#D8C91D" emissiveIntensity={0.18} side={THREE.DoubleSide} /></mesh>}

      {has('sunny-cap') && <group position={[0.05, 1.51, 0.03]} rotation={[0, 0, -0.08]}><mesh scale={[1.05, 0.42, 0.76]}><sphereGeometry args={[0.82, 36, 24]} /><meshStandardMaterial color="#F6BF3E" roughness={0.68} /></mesh><mesh position={[0.62, -0.17, 0.42]} rotation={[0.1, 0, 0]} scale={[0.76, 0.12, 0.45]}><sphereGeometry args={[0.7, 28, 18]} /><meshStandardMaterial color="#E9A928" roughness={0.7} /></mesh></group>}
      {has('trail-scarf') && <group position={[0, -0.03, 0.06]}><mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.05, 1.05, 0.18]}><torusGeometry args={[0.73, 0.16, 18, 48]} /><meshStandardMaterial color="#8068B6" roughness={0.72} /></mesh><mesh position={[0.63, -0.44, 0.48]} rotation={[0, 0, -0.22]} scale={[0.22, 0.72, 0.12]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#7158A7" roughness={0.75} /></mesh></group>}
      {has('petal-pin') && <group position={[0.73, 0.96, 0.82]} rotation={[0, 0, 0.12]}>{[0, 1, 2, 3, 4].map((index) => <mesh key={index} rotation={[0, 0, (index * Math.PI * 2) / 5]} position={[Math.cos((index * Math.PI * 2) / 5) * 0.17, Math.sin((index * Math.PI * 2) / 5) * 0.17, 0]} scale={[0.14, 0.22, 0.08]}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color="#F28A82" roughness={0.7} /></mesh>)}<mesh position={[0, 0, 0.07]} scale={0.11}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color="#F7C742" /></mesh></group>}
      {has('cloud-mitts') && <group><mesh position={[-0.98, -0.78, 0.22]} scale={[0.3, 0.36, 0.28]}><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color="#79D8C1" roughness={0.76} /></mesh><mesh position={[0.98, -0.78, 0.22]} scale={[0.3, 0.36, 0.28]}><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color="#79D8C1" roughness={0.76} /></mesh></group>}
      {has('meadow-socks') && <group><mesh position={[-0.57, -1.52, 0.54]} rotation={[0.28, 0, -0.13]} scale={[0.43, 0.28, 0.52]}><sphereGeometry args={[0.72, 28, 20]} /><meshStandardMaterial color="#7BCB79" roughness={0.8} /></mesh><mesh position={[0.57, -1.52, 0.54]} rotation={[0.28, 0, 0.13]} scale={[0.43, 0.28, 0.52]}><sphereGeometry args={[0.72, 28, 20]} /><meshStandardMaterial color="#7BCB79" roughness={0.8} /></mesh></group>}
      {has('tide-loop') && <mesh position={[-0.91, -0.5, 0.2]} rotation={[0.2, 1.02, -0.42]} scale={[0.42, 0.42, 0.18]}><torusGeometry args={[0.5, 0.11, 16, 36]} /><meshStandardMaterial color="#48BED2" metalness={0.2} roughness={0.48} /></mesh>}
    </group>
  );
}

export function MascotWorld({ mascotType, accessories, manualRotationX, manualRotationY, isInteracting, autoRotate }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  const animationEnabled = autoRotate ?? true;
  return (
    <>
      <BearFrameDriver active={Boolean(animationEnabled || isInteracting)} />
      <ambientLight intensity={1.75} />
      <directionalLight position={[3, 5, 5]} intensity={2.2} color="#FFF8E8" />
      <directionalLight position={[-4, 1, 2]} intensity={0.9} color="#D8E5FF" />
      <pointLight position={[0, -1, 4]} intensity={0.5} color="#FFF5C8" />
      <MascotModel3D mascotType={mascotType} accessories={accessories} manualRotationX={manualRotationX} manualRotationY={manualRotationY} isInteracting={isInteracting} autoRotate={animationEnabled} />
    </>
  );
}

function BearFrameDriver({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
    if (!active) return undefined;
    const interval = setInterval(invalidate, 1000 / 60);
    return () => clearInterval(interval);
  }, [active, invalidate]);

  return null;
}
