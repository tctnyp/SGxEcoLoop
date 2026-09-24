import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AccessoryId } from '../types';

export function AccessoryModel3D({ id }: { id: AccessoryId }) {
  const group = useRef<THREE.Group>(null);
  const star = useMemo(() => {
    const shape = new THREE.Shape();
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? 0.78 : 0.34;
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      if (index === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.closePath();
    return shape;
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.48;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.06;
  });

  return (
    <group ref={group} rotation={[0.12, -0.48, 0]}>
      {id === 'sunny-cap' && <group rotation={[0.05, 0, -0.08]}><mesh scale={[1.1, 0.48, 0.86]}><sphereGeometry args={[0.92, 36, 24]} /><meshStandardMaterial color="#F6BF3E" roughness={0.62} /></mesh><mesh position={[0.72, -0.24, 0.48]} scale={[0.92, 0.14, 0.55]}><sphereGeometry args={[0.7, 28, 18]} /><meshStandardMaterial color="#E9A928" roughness={0.68} /></mesh></group>}
      {id === 'trail-scarf' && <group><mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.12, 1.12, 0.32]}><torusGeometry args={[0.72, 0.2, 20, 52]} /><meshStandardMaterial color="#8068B6" roughness={0.7} /></mesh><mesh position={[0.62, -0.72, 0.34]} rotation={[0.08, 0, -0.18]} scale={[0.31, 0.92, 0.14]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#7158A7" roughness={0.75} /></mesh></group>}
      {id === 'cloud-mitts' && <group><mesh position={[-0.63, 0, 0]} scale={[0.58, 0.7, 0.48]}><sphereGeometry args={[1, 28, 20]} /><meshStandardMaterial color="#79D8C1" roughness={0.73} /></mesh><mesh position={[0.63, 0, 0]} scale={[0.58, 0.7, 0.48]}><sphereGeometry args={[1, 28, 20]} /><meshStandardMaterial color="#79D8C1" roughness={0.73} /></mesh></group>}
      {id === 'meadow-socks' && <group><mesh position={[-0.5, 0, 0]} rotation={[0.12, 0, -0.08]} scale={[0.48, 0.72, 0.54]}><capsuleGeometry args={[0.58, 0.58, 12, 24]} /><meshStandardMaterial color="#7BCB79" roughness={0.78} /></mesh><mesh position={[0.5, 0, 0]} rotation={[0.12, 0, 0.08]} scale={[0.48, 0.72, 0.54]}><capsuleGeometry args={[0.58, 0.58, 12, 24]} /><meshStandardMaterial color="#7BCB79" roughness={0.78} /></mesh></group>}
      {id === 'petal-pin' && <group>{[0, 1, 2, 3, 4].map((index) => <mesh key={index} rotation={[0, 0, (index * Math.PI * 2) / 5]} position={[Math.cos((index * Math.PI * 2) / 5) * 0.46, Math.sin((index * Math.PI * 2) / 5) * 0.46, 0]} scale={[0.38, 0.65, 0.2]}><sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#F28A82" roughness={0.66} /></mesh>)}<mesh position={[0, 0, 0.18]} scale={0.3}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color="#F7C742" /></mesh></group>}
      {id === 'bright-star' && <mesh><shapeGeometry args={[star]} /><meshStandardMaterial color="#F5E94B" emissive="#D8C91D" emissiveIntensity={0.18} side={THREE.DoubleSide} /></mesh>}
      {id === 'tide-loop' && <mesh rotation={[0.1, 0.35, 0.16]}><torusGeometry args={[0.78, 0.16, 20, 52]} /><meshStandardMaterial color="#48BED2" metalness={0.2} roughness={0.45} /></mesh>}
    </group>
  );
}

export function AccessoryWorld({ id }: { id: AccessoryId }) {
  return <><ambientLight intensity={2} /><directionalLight position={[3, 5, 5]} intensity={2.4} color="#FFF8E8" /><directionalLight position={[-4, 1, 2]} intensity={1} color="#D8E5FF" /><AccessoryModel3D id={id} /></>;
}
