import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

export function GridBackground({ color = '#C8CCC4', opacity = 0.28 }: { color?: string; opacity?: number }) {
  const { width } = useWindowDimensions();
  const gap = width < 500 ? 27 : 34;

  return (
    <Svg width="100%" height="100%" style={styles.noPointer} pointerEvents="none">
      <Defs>
        <Pattern id="novo-grid-dots" width={gap} height={gap} patternUnits="userSpaceOnUse">
          <Circle cx={8} cy={8} r={1} fill={color} opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#novo-grid-dots)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  noPointer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
});
