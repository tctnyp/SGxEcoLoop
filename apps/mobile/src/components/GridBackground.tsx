import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

export function GridBackground({ color = '#C8CCC4', opacity = 0.28 }: { color?: string; opacity?: number }) {
  const { width, height } = useWindowDimensions();
  const dots = useMemo(() => {
    const gap = width < 500 ? 27 : 34;
    const columns = Math.ceil(width / gap) + 1;
    const rows = Math.ceil(height / gap) + 1;
    return Array.from({ length: columns * rows }, (_, index) => ({
      left: (index % columns) * gap + 8,
      top: Math.floor(index / columns) * gap + 8,
    }));
  }, [height, width]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
      {dots.map((dot, index) => <View key={index} style={[styles.dot, dot, { backgroundColor: color, opacity }]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  noPointer: { pointerEvents: 'none', overflow: 'hidden' },
  dot: { position: 'absolute', width: 2, height: 2, borderRadius: 2 },
});
