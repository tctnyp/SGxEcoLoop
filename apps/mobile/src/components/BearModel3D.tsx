import { useFrame, useThree } from '@react-three/fiber';
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AccessoryId, MascotType } from '../types';

type SurfaceKind = 'fur' | 'feather' | 'scale' | 'fabric';

const MASCOT_COLORS: Record<MascotType, { body: string; head: string; accent: string; dark: string }> = {
  'polar-bear': { body: '#E9ECE9', head: '#F7F7F2', accent: '#C8D1D2', dark: '#1C2424' },
  penguin: { body: '#171C1D', head: '#111617', accent: '#F3F0E5', dark: '#0A0D0D' },
  fox: { body: '#D9652B', head: '#E87833', accent: '#FFF0D6', dark: '#241A18' },
  turtle: { body: '#4F9B68', head: '#6CB982', accent: '#D9C997', dark: '#173927' },
  bird: { body: '#367FBD', head: '#559ED4', accent: '#D5ECF4', dark: '#163953' },
};

function SurfaceMaterial({ color, kind, roughness = 0.84 }: { color: string; kind: SurfaceKind; roughness?: number }) {
  const isScaly = kind === 'scale';
  const isFeathery = kind === 'feather';
  return <meshPhysicalMaterial color={color} roughness={roughness} sheen={isScaly ? 0.08 : isFeathery ? 0.34 : 0.46} sheenRoughness={0.82} sheenColor={color} clearcoat={isScaly ? 0.18 : 0.02} clearcoatRoughness={0.74} />;
}

function Eye({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  return <group position={[x, y, z]} scale={scale}><mesh scale={[0.105, 0.125, 0.075]}><sphereGeometry args={[1, 20, 16]} /><meshPhysicalMaterial color="#101716" roughness={0.18} clearcoat={0.7} /></mesh><mesh position={[-0.03, 0.045, 0.07]} scale={0.026}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#FFFFFF" /></mesh></group>;
}

function Smile({ y, z, color = '#352724' }: { y: number; z: number; color?: string }) {
  return <group position={[0, y, z]}><mesh position={[-0.075, -0.02, 0]} rotation={[0, 0, -0.5]} scale={[0.018, 0.11, 0.018]}><capsuleGeometry args={[1, 1, 4, 8]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh><mesh position={[0.075, -0.02, 0]} rotation={[0, 0, 0.5]} scale={[0.018, 0.11, 0.018]}><capsuleGeometry args={[1, 1, 4, 8]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh></group>;
}

function PolarBear() {
  const color = MASCOT_COLORS['polar-bear'];
  return <group>
    <mesh position={[0, -0.5, 0]} scale={[1.03, 1.12, 0.77]}><sphereGeometry args={[0.96, 40, 30]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh>
    <mesh position={[0, 0.67, 0.03]} scale={[1.02, 0.93, 0.9]}><sphereGeometry args={[1.03, 40, 30]} /><SurfaceMaterial color={color.head} kind="fur" /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 0.72, 1.34, 0.03]} rotation={[0, 0, side * 0.16]}><mesh scale={[0.34, 0.39, 0.27]}><sphereGeometry args={[1, 28, 20]} /><SurfaceMaterial color={color.head} kind="fur" /></mesh><mesh position={[0, 0.015, 0.23]} scale={[0.19, 0.23, 0.06]}><sphereGeometry args={[1, 22, 16]} /><meshStandardMaterial color="#AEBBBB" roughness={0.92} /></mesh></group>)}
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.8, -0.45, 0]} rotation={[0, 0, side * 0.38]} scale={[0.38, 0.78, 0.4]}><capsuleGeometry args={[0.58, 0.72, 10, 22]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh>)}
    {[-1, 1].map((side) => <group key={side} position={[side * 0.54, -1.39, 0.28]} rotation={[0.24, 0, side * 0.1]}><mesh scale={[0.48, 0.38, 0.65]}><sphereGeometry args={[0.83, 30, 22]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh><mesh position={[0, -0.03, 0.49]} scale={[0.24, 0.17, 0.035]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#73807D" roughness={0.88} /></mesh>{[-0.14, 0, 0.14].map((toe) => <mesh key={toe} position={[toe, 0.13, 0.51]} scale={[0.025, 0.075, 0.025]} rotation={[0.25, 0, 0]}><capsuleGeometry args={[1, 0.4, 4, 8]} /><meshStandardMaterial color="#3B4543" /></mesh>)}</group>)}
    <mesh position={[0, 0.43, 0.79]} scale={[0.54, 0.4, 0.3]}><sphereGeometry args={[0.78, 30, 22]} /><SurfaceMaterial color="#D9DEDA" kind="fur" /></mesh>
    <mesh position={[0, 0.58, 1.035]} scale={[0.17, 0.12, 0.095]}><sphereGeometry args={[1, 22, 16]} /><meshPhysicalMaterial color={color.dark} roughness={0.28} clearcoat={0.38} /></mesh>
    <Eye x={-0.37} y={0.9} z={0.88} /><Eye x={0.37} y={0.9} z={0.88} /><Smile y={0.42} z={1.055} />
    <mesh position={[0, -0.85, -0.72]} scale={[0.25, 0.3, 0.22]}><sphereGeometry args={[1, 22, 16]} /><SurfaceMaterial color={color.head} kind="fur" /></mesh>
  </group>;
}

function Penguin() {
  const color = MASCOT_COLORS.penguin;
  return <group>
    <mesh position={[0, -0.48, -0.03]} scale={[0.87, 1.22, 0.72]}><sphereGeometry args={[1, 40, 30]} /><SurfaceMaterial color={color.body} kind="feather" roughness={0.76} /></mesh>
    <mesh position={[0, 0.69, 0]} scale={[0.91, 0.87, 0.82]}><sphereGeometry args={[1, 40, 30]} /><SurfaceMaterial color={color.head} kind="feather" roughness={0.75} /></mesh>
    <mesh position={[0, -0.47, 0.65]} scale={[0.63, 0.91, 0.18]}><sphereGeometry args={[0.92, 34, 26]} /><SurfaceMaterial color={color.accent} kind="feather" /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.27, 0.77, 0.7]} rotation={[0, side * 0.04, side * 0.09]} scale={[0.39, 0.57, 0.16]}><sphereGeometry args={[1, 28, 20]} /><SurfaceMaterial color="#F8F5EA" kind="feather" /></mesh>)}
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.87, -0.38, -0.02]} rotation={[0.12, 0, side * 0.36]} scale={[0.19, 0.86, 0.42]}><capsuleGeometry args={[0.66, 0.82, 10, 22]} /><SurfaceMaterial color="#0E1314" kind="feather" /></mesh>)}
    <mesh position={[0, 0.58, 1.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.21, 0.35, 0.2]}><coneGeometry args={[1, 1, 4]} /><meshPhysicalMaterial color="#F0A22E" roughness={0.64} clearcoat={0.08} /></mesh>
    <Eye x={-0.34} y={0.91} z={0.84} scale={0.92} /><Eye x={0.34} y={0.91} z={0.84} scale={0.92} />
    {[-1, 1].map((side) => <group key={side} position={[side * 0.45, -1.59, 0.42]}><mesh scale={[0.49, 0.13, 0.54]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#E99A28" roughness={0.7} /></mesh>{[-0.18, 0, 0.18].map((toe) => <mesh key={toe} position={[toe, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]} scale={[0.06, 0.23, 0.06]}><capsuleGeometry args={[1, 0.7, 5, 10]} /><meshStandardMaterial color="#DB8720" /></mesh>)}</group>)}
    <mesh position={[0, -1.26, -0.62]} rotation={[-0.45, 0, 0]} scale={[0.3, 0.38, 0.18]}><coneGeometry args={[1, 1.4, 4]} /><SurfaceMaterial color="#111617" kind="feather" /></mesh>
  </group>;
}

function Fox() {
  const color = MASCOT_COLORS.fox;
  return <group>
    <mesh position={[0, -0.52, 0]} scale={[0.92, 1.08, 0.7]}><sphereGeometry args={[0.96, 40, 30]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh>
    <mesh position={[0, 0.67, 0.01]} scale={[0.9, 0.91, 0.82]}><sphereGeometry args={[1.03, 40, 30]} /><SurfaceMaterial color={color.head} kind="fur" /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 0.59, 1.48, -0.02]} rotation={[0, 0, side * 0.13]}><mesh scale={[0.34, 0.63, 0.29]}><coneGeometry args={[1, 1.8, 4]} /><SurfaceMaterial color={color.head} kind="fur" /></mesh><mesh position={[0, 0.12, 0.25]} scale={[0.19, 0.4, 0.04]}><coneGeometry args={[1, 1.55, 4]} /><meshStandardMaterial color="#783C33" roughness={0.92} /></mesh><mesh position={[0, 0.42, 0.02]} scale={[0.22, 0.26, 0.24]}><coneGeometry args={[1, 1.15, 4]} /><SurfaceMaterial color={color.dark} kind="fur" /></mesh></group>)}
    <mesh position={[0, 0.43, 0.84]} scale={[0.45, 0.3, 0.43]}><sphereGeometry args={[1, 30, 22]} /><SurfaceMaterial color={color.accent} kind="fur" /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.34, 0.47, 0.79]} scale={[0.34, 0.28, 0.21]}><sphereGeometry args={[1, 26, 18]} /><SurfaceMaterial color={color.accent} kind="fur" /></mesh>)}
    <mesh position={[0, 0.51, 1.17]} scale={[0.14, 0.1, 0.095]}><sphereGeometry args={[1, 20, 14]} /><meshPhysicalMaterial color={color.dark} roughness={0.26} clearcoat={0.42} /></mesh>
    <Eye x={-0.33} y={0.91} z={0.82} scale={0.9} /><Eye x={0.33} y={0.91} z={0.82} scale={0.9} /><Smile y={0.35} z={1.11} />
    <mesh position={[0, -0.25, 0.68]} scale={[0.46, 0.74, 0.17]}><sphereGeometry args={[1, 28, 20]} /><SurfaceMaterial color={color.accent} kind="fur" /></mesh>
    {[-1, 1].map((side) => <group key={side}><mesh position={[side * 0.76, -0.48, 0]} rotation={[0, 0, side * 0.4]} scale={[0.33, 0.77, 0.34]}><capsuleGeometry args={[0.58, 0.72, 10, 22]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh><mesh position={[side * 1.01, -0.9, 0.05]} rotation={[0, 0, side * 0.34]} scale={[0.3, 0.33, 0.32]}><sphereGeometry args={[1, 24, 18]} /><SurfaceMaterial color={color.dark} kind="fur" /></mesh></group>)}
    {[-1, 1].map((side) => <group key={side}><mesh position={[side * 0.5, -1.28, 0.18]} scale={[0.38, 0.58, 0.4]}><capsuleGeometry args={[0.6, 0.5, 10, 20]} /><SurfaceMaterial color={color.dark} kind="fur" /></mesh><mesh position={[side * 0.5, -1.62, 0.43]} scale={[0.42, 0.24, 0.54]}><sphereGeometry args={[1, 26, 18]} /><SurfaceMaterial color="#2B211F" kind="fur" /></mesh></group>)}
    <group position={[0.9, -0.76, -0.43]} rotation={[0.08, 0.1, -0.61]}><mesh scale={[0.39, 1.08, 0.4]}><capsuleGeometry args={[0.67, 0.85, 12, 24]} /><SurfaceMaterial color={color.body} kind="fur" /></mesh><mesh position={[0, -0.85, 0]} scale={[0.37, 0.45, 0.38]}><sphereGeometry args={[1, 26, 18]} /><SurfaceMaterial color={color.accent} kind="fur" /></mesh></group>
  </group>;
}

function Turtle() {
  const color = MASCOT_COLORS.turtle;
  const shellScutes: Array<[number, number]> = [[0, 0], [-0.42, 0.02], [0.42, 0.02], [-0.23, 0.43], [0.23, 0.43], [-0.23, -0.43], [0.23, -0.43]];
  return <group>
    <mesh position={[0, -0.55, -0.12]} scale={[1.03, 1.05, 0.7]}><sphereGeometry args={[0.96, 40, 30]} /><SurfaceMaterial color={color.body} kind="scale" /></mesh>
    <mesh position={[0, 0.59, 0.06]} scale={[0.84, 0.75, 0.78]}><sphereGeometry args={[1.03, 38, 28]} /><SurfaceMaterial color={color.head} kind="scale" /></mesh>
    <mesh position={[0, -0.56, -0.68]} scale={[1.08, 1.12, 0.34]}><sphereGeometry args={[1, 40, 30]} /><meshPhysicalMaterial color="#285E3D" roughness={0.67} clearcoat={0.24} clearcoatRoughness={0.55} /></mesh>
    <mesh position={[0, -0.55, -1.005]} scale={[0.91, 0.96, 1]} rotation={[0, Math.PI, 0]}><circleGeometry args={[1, 48]} /><meshStandardMaterial color="#386F46" roughness={0.66} polygonOffset polygonOffsetFactor={-1} /></mesh>
    {shellScutes.map(([x, y], index) => <mesh key={index} position={[x, y - 0.55, -1.02]} rotation={[0, Math.PI, index * 0.31]} scale={index === 0 ? 0.32 : 0.25}><circleGeometry args={[1, 6]} /><meshPhysicalMaterial color={index % 2 ? '#76A658' : '#89B866'} roughness={0.7} clearcoat={0.1} /></mesh>)}
    <mesh position={[0, -0.47, 0.66]} scale={[0.66, 0.83, 0.16]}><sphereGeometry args={[0.92, 32, 24]} /><meshStandardMaterial color={color.accent} roughness={0.85} /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.82, -0.48, 0.02]} rotation={[0.08, 0, side * 0.42]} scale={[0.39, 0.73, 0.33]}><capsuleGeometry args={[0.58, 0.7, 10, 22]} /><SurfaceMaterial color={color.head} kind="scale" /></mesh>)}
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.51, -1.42, 0.27]} rotation={[0.16, 0, side * 0.08]} scale={[0.48, 0.35, 0.62]}><sphereGeometry args={[0.8, 28, 20]} /><SurfaceMaterial color={color.head} kind="scale" /></mesh>)}
    <mesh position={[0, 0.51, 0.82]} rotation={[Math.PI / 2, 0, 0]} scale={[0.28, 0.23, 0.16]}><coneGeometry args={[1, 0.85, 4]} /><meshStandardMaterial color="#D8C586" roughness={0.74} /></mesh>
    <Eye x={-0.31} y={0.8} z={0.75} scale={0.9} /><Eye x={0.31} y={0.8} z={0.75} scale={0.9} /><Smile y={0.43} z={0.9} color="#204731" />
    <mesh position={[0, -1.28, -0.72]} rotation={[-0.42, 0, 0]} scale={[0.23, 0.37, 0.18]}><coneGeometry args={[1, 1.3, 5]} /><SurfaceMaterial color={color.head} kind="scale" /></mesh>
  </group>;
}

function Bird() {
  const color = MASCOT_COLORS.bird;
  return <group>
    <mesh position={[0, -0.51, 0]} scale={[0.91, 1.1, 0.74]}><sphereGeometry args={[0.96, 40, 30]} /><SurfaceMaterial color={color.body} kind="feather" roughness={0.75} /></mesh>
    <mesh position={[0, 0.67, 0.02]} scale={[0.88, 0.84, 0.8]}><sphereGeometry args={[1.03, 38, 28]} /><SurfaceMaterial color={color.head} kind="feather" roughness={0.74} /></mesh>
    <mesh position={[0, -0.36, 0.66]} scale={[0.59, 0.84, 0.17]}><sphereGeometry args={[0.92, 32, 24]} /><SurfaceMaterial color={color.accent} kind="feather" /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 0.82, -0.42, -0.02]} rotation={[0.06, side * 0.03, side * 0.48]}><mesh scale={[0.28, 0.9, 0.47]}><capsuleGeometry args={[0.7, 0.7, 10, 22]} /><SurfaceMaterial color="#2F73AD" kind="feather" /></mesh>{[0.2, -0.08, -0.36].map((y, index) => <mesh key={y} position={[side * 0.08, y, 0.4]} rotation={[0, 0, side * -0.08]} scale={[0.19 - index * 0.025, 0.42, 0.07]}><sphereGeometry args={[1, 20, 14]} /><SurfaceMaterial color={index % 2 ? '#5EA6D6' : '#70B4DF'} kind="feather" /></mesh>)}</group>)}
    <mesh position={[0, 0.57, 1.01]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.35, 0.2]}><coneGeometry args={[1, 1.08, 4]} /><meshPhysicalMaterial color="#E7A62F" roughness={0.62} clearcoat={0.08} /></mesh>
    <Eye x={-0.32} y={0.89} z={0.8} scale={0.94} /><Eye x={0.32} y={0.89} z={0.8} scale={0.94} />
    <group position={[0, 1.46, -0.04]} rotation={[0.05, 0, -0.15]}>{[-0.14, 0, 0.14].map((x, index) => <mesh key={x} position={[x, index === 1 ? 0.12 : 0, 0]} rotation={[0, 0, x * -1.4]} scale={[0.12, 0.43 + index * 0.06, 0.13]}><coneGeometry args={[1, 1.6, 5]} /><SurfaceMaterial color={index === 1 ? '#82C4E7' : '#6DB2DC'} kind="feather" /></mesh>)}</group>
    <group position={[0, -1.35, -0.56]}>{[-0.3, 0, 0.3].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[0.34, 0, -x]} scale={[0.2, 0.7, 0.12]}><capsuleGeometry args={[0.6, 0.6, 8, 16]} /><SurfaceMaterial color="#28689E" kind="feather" /></mesh>)}</group>
    {[-1, 1].map((side) => <group key={side} position={[side * 0.4, -1.57, 0.38]}><mesh scale={[0.09, 0.22, 0.09]}><capsuleGeometry args={[1, 0.4, 5, 10]} /><meshStandardMaterial color="#A96D28" /></mesh>{[-0.12, 0, 0.12].map((toe) => <mesh key={toe} position={[toe, -0.12, 0.17]} rotation={[Math.PI / 2, 0, 0]} scale={[0.035, 0.18, 0.035]}><capsuleGeometry args={[1, 0.5, 5, 10]} /><meshStandardMaterial color="#9A6125" /></mesh>)}</group>)}
  </group>;
}

function EquippedAccessories({ accessories, star }: { accessories: AccessoryId[]; star: THREE.Shape }) {
  const has = (id: AccessoryId) => accessories.includes(id);
  return <group>
    {has('bright-star') && <mesh position={[0, -0.54, 0.82]} scale={0.88}><shapeGeometry args={[star]} /><meshPhysicalMaterial color="#F5E94B" emissive="#C8B900" emissiveIntensity={0.12} roughness={0.46} clearcoat={0.16} side={THREE.DoubleSide} /></mesh>}
    {has('sunny-cap') && <group position={[0.04, 1.52, 0.02]} rotation={[0.02, 0, -0.08]}><mesh scale={[1.04, 0.42, 0.76]}><sphereGeometry args={[0.82, 36, 24]} /><SurfaceMaterial color="#F6BF3E" kind="fabric" roughness={0.72} /></mesh><mesh position={[0.61, -0.16, 0.43]} rotation={[0.1, 0, 0]} scale={[0.76, 0.12, 0.45]}><sphereGeometry args={[0.7, 28, 18]} /><SurfaceMaterial color="#E9A928" kind="fabric" /></mesh><mesh position={[0, 0.36, 0]} scale={0.085}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#C88C1B" roughness={0.7} /></mesh></group>}
    {has('trail-scarf') && <group position={[0, 0.02, 0.06]}><mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.04, 1.04, 0.18]}><torusGeometry args={[0.73, 0.16, 18, 48]} /><SurfaceMaterial color="#8068B6" kind="fabric" /></mesh><mesh position={[0.62, -0.45, 0.49]} rotation={[0, 0, -0.22]} scale={[0.22, 0.72, 0.12]}><boxGeometry args={[1, 1, 1]} /><SurfaceMaterial color="#7158A7" kind="fabric" /></mesh>{[-0.25, 0, 0.25].map((offset) => <mesh key={offset} position={[0.62 + offset * 0.22, -0.82, 0.5]} rotation={[0, 0, -0.22]} scale={[0.025, 0.18, 0.025]}><capsuleGeometry args={[1, 0.4, 4, 8]} /><meshStandardMaterial color="#A997D0" /></mesh>)}</group>}
    {has('petal-pin') && <group position={[0.66, 0.42, 0.84]} rotation={[0, 0, 0.12]}>{[0, 1, 2, 3, 4].map((index) => <mesh key={index} rotation={[0, 0, (index * Math.PI * 2) / 5]} position={[Math.cos((index * Math.PI * 2) / 5) * 0.17, Math.sin((index * Math.PI * 2) / 5) * 0.17, 0]} scale={[0.14, 0.22, 0.08]}><sphereGeometry args={[1, 18, 14]} /><meshPhysicalMaterial color="#F28A82" roughness={0.62} clearcoat={0.1} /></mesh>)}<mesh position={[0, 0, 0.07]} scale={0.11}><sphereGeometry args={[1, 18, 14]} /><meshPhysicalMaterial color="#F7C742" roughness={0.45} /></mesh></group>}
    {has('cloud-mitts') && <group>{[-1, 1].map((side) => <mesh key={side} position={[side * 0.98, -0.78, 0.23]} scale={[0.31, 0.37, 0.29]}><sphereGeometry args={[1, 24, 18]} /><SurfaceMaterial color="#79D8C1" kind="fabric" /></mesh>)}</group>}
    {has('meadow-socks') && <group>{[-1, 1].map((side) => <mesh key={side} position={[side * 0.55, -1.52, 0.53]} rotation={[0.28, 0, side * 0.13]} scale={[0.44, 0.29, 0.53]}><sphereGeometry args={[0.72, 28, 20]} /><SurfaceMaterial color="#7BCB79" kind="fabric" /></mesh>)}</group>}
    {has('tide-loop') && <mesh position={[-0.91, -0.5, 0.2]} rotation={[0.2, 1.02, -0.42]} scale={[0.42, 0.42, 0.18]}><torusGeometry args={[0.5, 0.11, 16, 36]} /><meshPhysicalMaterial color="#48BED2" metalness={0.24} roughness={0.32} clearcoat={0.56} clearcoatRoughness={0.18} iridescence={0.28} /></mesh>}
  </group>;
}

function makeStar() {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? 0.32 : 0.14;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    if (index === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  return shape;
}

export function MascotModel3D({ mascotType, accessories, manualRotationX = 0, manualRotationY = 0, isInteracting = false, autoRotate = true }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const lastManualRotation = useRef({ x: 0, y: 0 });
  const star = useMemo(makeStar, []);

  useEffect(() => {
    if (group.current) {
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
    if (!isInteracting) group.current.rotation.y += delta * 0.3;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 1.18) * 0.03 - 0.08;
  });

  let animal: ReactNode;
  if (mascotType === 'penguin') animal = <Penguin />;
  else if (mascotType === 'fox') animal = <Fox />;
  else if (mascotType === 'turtle') animal = <Turtle />;
  else if (mascotType === 'bird') animal = <Bird />;
  else animal = <PolarBear />;

  return <group ref={group} scale={0.78}>{animal}<EquippedAccessories accessories={accessories} star={star} /></group>;
}

export function MascotWorld({ mascotType, accessories, manualRotationX, manualRotationY, isInteracting, autoRotate }: { mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }) {
  const animationEnabled = autoRotate ?? true;
  return <>
    <BearFrameDriver active={Boolean(animationEnabled || isInteracting)} />
    <hemisphereLight args={['#FFF8EC', '#9EB6AA', 1.35]} />
    <directionalLight position={[3.6, 5.4, 5.2]} intensity={2.45} color="#FFF7E2" />
    <directionalLight position={[-4.2, 1.5, 2.8]} intensity={1.05} color="#CCE0FF" />
    <pointLight position={[0, -1.2, 4]} intensity={0.42} color="#FFF0BA" />
    <MascotModel3D mascotType={mascotType} accessories={accessories} manualRotationX={manualRotationX} manualRotationY={manualRotationY} isInteracting={isInteracting} autoRotate={animationEnabled} />
  </>;
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
