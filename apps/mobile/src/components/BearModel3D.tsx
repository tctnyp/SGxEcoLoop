import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AccessoryId } from '../types';

export function BearModel3D({ accessories, manualRotation = 0, isInteracting = false, autoRotate = true }: { accessories: AccessoryId[]; manualRotation?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const lastManualRotation = useRef(0);
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

  useEffect(() => {
    if (group.current) group.current.rotation.y += manualRotation - lastManualRotation.current;
    lastManualRotation.current = manualRotation;
  }, [manualRotation]);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!isInteracting && autoRotate) group.current.rotation.y += delta * 0.32;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.25) * 0.035 - 0.08;
  });

  const has = (id: AccessoryId) => accessories.includes(id);
  return (
    <group ref={group} scale={0.8}>
      <mesh position={[0, -0.55, 0]} scale={[1.04, 1.12, 0.74]} castShadow><sphereGeometry args={[0.96, 48, 36]} /><meshStandardMaterial color="#E7E0D4" roughness={0.92} /></mesh>
      <mesh position={[0, 0.67, 0.02]} scale={[1.04, 0.94, 0.9]} castShadow><sphereGeometry args={[1.03, 48, 36]} /><meshStandardMaterial color="#F1ECE3" roughness={0.9} /></mesh>
      <mesh position={[-0.73, 1.31, -0.02]} rotation={[0, 0, -0.22]} scale={[0.42, 0.5, 0.3]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#D7C8B4" roughness={0.94} /></mesh>
      <mesh position={[0.73, 1.31, -0.02]} rotation={[0, 0, 0.22]} scale={[0.42, 0.5, 0.3]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#D7C8B4" roughness={0.94} /></mesh>
      <mesh position={[-0.74, -0.48, 0.02]} rotation={[0, 0, -0.42]} scale={[0.36, 0.82, 0.36]} castShadow><capsuleGeometry args={[0.6, 0.7, 12, 24]} /><meshStandardMaterial color="#E6DED1" roughness={0.95} /></mesh>
      <mesh position={[0.74, -0.48, 0.02]} rotation={[0, 0, 0.42]} scale={[0.36, 0.82, 0.36]} castShadow><capsuleGeometry args={[0.6, 0.7, 12, 24]} /><meshStandardMaterial color="#E6DED1" roughness={0.95} /></mesh>
      <mesh position={[-0.55, -1.42, 0.28]} rotation={[0.28, 0, -0.13]} scale={[0.62, 0.48, 0.82]} castShadow><sphereGeometry args={[0.72, 32, 24]} /><meshStandardMaterial color="#DDD3C3" roughness={0.95} /></mesh>
      <mesh position={[0.55, -1.42, 0.28]} rotation={[0.28, 0, 0.13]} scale={[0.62, 0.48, 0.82]} castShadow><sphereGeometry args={[0.72, 32, 24]} /><meshStandardMaterial color="#DDD3C3" roughness={0.95} /></mesh>
      <mesh position={[0, 0.42, 0.82]} scale={[0.58, 0.42, 0.24]}><sphereGeometry args={[0.74, 32, 24]} /><meshStandardMaterial color="#E0D5C6" roughness={0.92} /></mesh>
      <mesh position={[0, 0.61, 1.02]} scale={[0.16, 0.11, 0.1]}><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color="#4A3834" roughness={0.4} /></mesh>
      <mesh position={[-0.37, 0.88, 0.87]} scale={[0.095, 0.12, 0.07]}><sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#302B28" roughness={0.28} /></mesh>
      <mesh position={[0.37, 0.88, 0.87]} scale={[0.095, 0.12, 0.07]}><sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#302B28" roughness={0.28} /></mesh>
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

export function BearWorld({ accessories, manualRotation, isInteracting, autoRotate }: { accessories: AccessoryId[]; manualRotation?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  return (
    <>
      <ambientLight intensity={1.75} />
      <directionalLight position={[3, 5, 5]} intensity={2.2} color="#FFF8E8" />
      <directionalLight position={[-4, 1, 2]} intensity={0.9} color="#D8E5FF" />
      <pointLight position={[0, -1, 4]} intensity={0.5} color="#FFF5C8" />
      <BearModel3D accessories={accessories} manualRotation={manualRotation} isInteracting={isInteracting} autoRotate={autoRotate} />
    </>
  );
}
