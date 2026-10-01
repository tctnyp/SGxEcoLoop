import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AccessoryId } from '../types';

function createFabricTexture() {
  const size = 48;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const weave = Math.sin(x * Math.PI / 2) * 24 + Math.sin(y * Math.PI / 2) * 24;
      const noise = ((x * 47 + y * 89 + x * y * 7) % 23) - 11;
      const value = Math.max(145, Math.min(245, Math.round(202 + weave + noise)));
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function FabricMaterial({ color, texture, roughness = 0.8 }: { color: string; texture: THREE.Texture; roughness?: number }) {
  return <meshPhysicalMaterial color={color} bumpMap={texture} bumpScale={0.04} roughness={roughness} roughnessMap={texture} sheen={0.58} sheenColor={color} sheenRoughness={0.82} />;
}

export function AccessoryModel3D({ id, animate = true }: { id: AccessoryId; animate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const fabric = useMemo(createFabricTexture, []);
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

  useEffect(() => () => fabric.dispose(), [fabric]);

  useFrame((state, delta) => {
    if (!group.current || !animate) return;
    group.current.rotation.y += delta * 0.48;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.06;
  });

  return (
    <group ref={group} rotation={[0.12, -0.48, 0]}>
      {id === 'sunny-cap' && <group rotation={[0.05, 0, -0.08]}><mesh scale={[1.1, 0.48, 0.86]}><sphereGeometry args={[0.92, 36, 24]} /><FabricMaterial color="#F6BF3E" texture={fabric} roughness={0.72} /></mesh><mesh position={[0.72, -0.24, 0.48]} scale={[0.92, 0.14, 0.55]}><sphereGeometry args={[0.7, 28, 18]} /><FabricMaterial color="#E9A928" texture={fabric} roughness={0.76} /></mesh><mesh position={[0,0.48,0]} scale={0.11}><sphereGeometry args={[1,18,14]}/><meshPhysicalMaterial color="#D99A20" roughness={0.7}/></mesh><mesh position={[0,0.2,0.78]} rotation={[Math.PI / 2,0,0]}><torusGeometry args={[0.42,0.018,8,28,Math.PI]}/><meshStandardMaterial color="#C98C1A" roughness={0.78}/></mesh></group>}
      {id === 'trail-scarf' && <group scale={0.78} position={[0, 0.28, 0]}><mesh rotation={[0.05, 0.12, -0.04]} scale={[1.08, 1.04, 0.34]}><torusGeometry args={[0.72, 0.2, 20, 52]} /><FabricMaterial color="#8068B6" texture={fabric} roughness={0.82} /></mesh><mesh position={[0.53, -0.54, 0.22]} rotation={[0.05, 0.08, -0.14]} scale={[0.29, 0.29, 0.2]}><sphereGeometry args={[1, 24, 18]} /><FabricMaterial color="#7158A7" texture={fabric} roughness={0.86} /></mesh><mesh position={[0.63, -1.02, 0.12]} rotation={[0.06, 0.08, -0.14]} scale={[0.31, 0.7, 0.14]}><boxGeometry args={[1, 1, 1]} /><FabricMaterial color="#7158A7" texture={fabric} roughness={0.86} /></mesh>{[-.48,-.24,0,.24,.48].map((offset)=><mesh key={offset} position={[0.63+offset*.14,-1.02+offset*.035,0.205]} rotation={[0.06,0.08,-0.14]} scale={[0.31,.025,.145]}><boxGeometry/><meshPhysicalMaterial color="#A997D0" roughness={0.86}/></mesh>)}{[-0.14,-0.045,0.045,0.14].map((x)=><mesh key={x} position={[0.72+x,-1.77,0.12]} rotation={[0,0,-0.14]} scale={[0.022,0.15,0.022]}><capsuleGeometry args={[1,.5,5,9]}/><meshStandardMaterial color="#7158A7"/></mesh>)}</group>}
      {id === 'cloud-mitts' && <group>{[-1,1].map((side)=><group key={side} position={[side*.63,0,0]}><mesh scale={[0.58, 0.7, 0.48]}><sphereGeometry args={[1, 28, 20]} /><FabricMaterial color="#79D8C1" texture={fabric} roughness={0.73} /></mesh><mesh position={[side*-.44,-.02,.08]} rotation={[0,0,side*.55]} scale={[.18,.3,.2]}><sphereGeometry args={[1,20,15]}/><FabricMaterial color="#68C8B0" texture={fabric}/></mesh><mesh position={[0,-.55,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.32,.055,10,28]}/><meshStandardMaterial color="#4EA990" roughness={.8}/></mesh></group>)}</group>}
      {id === 'meadow-socks' && <group>{[-1,1].map((side)=><group key={side} position={[side*.5,0,0]} rotation={[0.12,0,side*.08]}><mesh scale={[0.48,0.72,0.54]}><capsuleGeometry args={[0.58,0.58,12,24]}/><FabricMaterial color="#7BCB79" texture={fabric} roughness={0.78}/></mesh><mesh position={[0,-.48,.31]} scale={[.37,.18,.3]}><sphereGeometry args={[1,22,16]}/><FabricMaterial color="#5EAD61" texture={fabric}/></mesh><mesh position={[0,.56,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.3,.06,10,28]}/><meshStandardMaterial color="#4D9854" roughness={.82}/></mesh></group>)}</group>}
      {id === 'petal-pin' && <group>{[0, 1, 2, 3, 4].map((index) => <mesh key={index} rotation={[0, 0, (index * Math.PI * 2) / 5]} position={[Math.cos((index * Math.PI * 2) / 5) * 0.46, Math.sin((index * Math.PI * 2) / 5) * 0.46, 0]} scale={[0.38, 0.65, 0.2]}><sphereGeometry args={[1, 20, 16]} /><meshPhysicalMaterial color="#F28A82" roughness={0.66} /></mesh>)}<mesh position={[0, 0, 0.18]} scale={0.3}><sphereGeometry args={[1, 18, 14]} /><meshPhysicalMaterial color="#F7C742" /></mesh></group>}
      {id === 'bright-star' && <mesh><extrudeGeometry args={[star, { depth: 0.12, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.035, bevelSegments: 3 }]} /><meshPhysicalMaterial color="#F5E94B" emissive="#D8C91D" emissiveIntensity={0.12} roughness={0.38} clearcoat={0.32} /></mesh>}
      {id === 'tide-loop' && <mesh rotation={[0.1, 0.35, 0.16]}><torusGeometry args={[0.78, 0.16, 24, 64]} /><meshPhysicalMaterial color="#48BED2" metalness={0.34} roughness={0.3} clearcoat={0.48} clearcoatRoughness={0.2} iridescence={0.22} /></mesh>}
    </group>
  );
}

export function AccessoryWorld({ id, animate = true }: { id: AccessoryId; animate?: boolean }) {
  return <><ambientLight intensity={2} /><directionalLight position={[3, 5, 5]} intensity={2.4} color="#FFF8E8" /><directionalLight position={[-4, 1, 2]} intensity={1} color="#D8E5FF" /><AccessoryModel3D id={id} animate={animate} /></>;
}
