import { Canvas } from '@react-three/fiber';
import { Suspense, useState } from 'react';
import type { CSSProperties } from 'react';
import { MascotWorld } from '../../mobile/src/components/BearModel3D';
import type { MascotType } from '../../mobile/src/types';

const mascots: Array<{ type: MascotType; animal: string; wristband: string; color: string; soft: string; caption: string }> = [
  { type: 'polar-bear', animal: 'Polar Bear', wristband: 'Snowy White', color: '#E9ECE9', soft: '#F4F7F4', caption: 'Calm, curious and ready to make every small action count.' },
  { type: 'penguin', animal: 'Penguin', wristband: 'Charcoal Black', color: '#202829', soft: '#E8EFF0', caption: 'A bold teammate who keeps sustainable habits moving together.' },
  { type: 'fox', animal: 'Fox', wristband: 'Sunset Orange', color: '#E87833', soft: '#FFE8D7', caption: 'Bright, resourceful and always looking for a smarter second use.' },
  { type: 'turtle', animal: 'Turtle', wristband: 'Tropical Green', color: '#55A56F', soft: '#E0F2E2', caption: 'Steady progress that turns everyday care into long-term impact.' },
  { type: 'bird', animal: 'Bird', wristband: 'Ocean Blue', color: '#4B98D0', soft: '#DFEFF8', caption: 'An energetic explorer who brings local action into view.' },
];

export function MascotCarousel3D() {
  const [index, setIndex] = useState(0);
  const mascot = mascots[index]!;
  const move = (direction: number) => setIndex((current) => (current + direction + mascots.length) % mascots.length);

  return <section id="mascots" className="showcase-mascots" style={{ '--mascot-color': mascot.color, '--mascot-soft': mascot.soft } as CSSProperties}>
    <div className="showcase-mascot-copy">
      <p className="showcase-kicker">MEET THE NOVO FAMILY</p>
      <h2>Five wristbands.<br/>Five planet pals.</h2>
      <p>Every wristband reveals a different in-app mascot. Their shared proportions keep every digital accessory fitting naturally across the whole family.</p>
      <div className="showcase-mascot-meta" aria-live="polite">
        <span>{String(index + 1).padStart(2, '0')} / {String(mascots.length).padStart(2, '0')}</span>
        <div><small>{mascot.wristband} wristband</small><strong>{mascot.animal}</strong><p>{mascot.caption}</p></div>
      </div>
      <div className="showcase-mascot-controls">
        <button type="button" onClick={() => move(-1)} aria-label="Previous mascot">←</button>
        <div role="tablist" aria-label="Choose a novo mascot">{mascots.map((item, itemIndex) => <button type="button" role="tab" aria-selected={itemIndex === index} aria-label={`Show ${item.animal}`} className={itemIndex === index ? 'active' : ''} onClick={() => setIndex(itemIndex)} key={item.type}><span style={{ background: item.color }}/></button>)}</div>
        <button type="button" onClick={() => move(1)} aria-label="Next mascot">→</button>
      </div>
    </div>
    <div className="showcase-mascot-stage" aria-label={`${mascot.animal}, front-facing 3D model`}>
      <div className="showcase-mascot-halo"/>
      <div className="showcase-mascot-canvas">
        <Suspense fallback={<div className="showcase-mascot-loading">Preparing {mascot.animal}…</div>}>
          <Canvas key={mascot.type} camera={{ position: [0, 0.1, 5.7], fov: 38 }} dpr={[1, 1.6]} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}>
            <MascotWorld mascotType={mascot.type} accessories={[]} manualRotationX={0} manualRotationY={0} autoRotate={false} />
          </Canvas>
        </Suspense>
      </div>
      <span className="showcase-front-badge">Front-facing poster view</span>
      <strong>{mascot.animal}</strong>
      <small>{mascot.wristband}</small>
    </div>
  </section>;
}
