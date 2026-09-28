import { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('novo recovered from a startup error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.page} accessibilityRole="alert">
        <View style={styles.mark}><View style={styles.leaf} /></View>
        <Text style={styles.title}>novo needs a moment</Text>
        <Text style={styles.body}>An optional part of the app could not start. Your account and progress are safe.</Text>
        <Text selectable style={styles.detail}>{this.state.error.message || 'Unknown startup error'}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8EF',
    paddingHorizontal: 28,
  },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17352A',
    transform: [{ rotate: '-7deg' }],
  },
  leaf: {
    width: 19,
    height: 27,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: '#C9F36A',
    transform: [{ rotate: '20deg' }],
  },
  title: {
    marginTop: 24,
    color: '#17352A',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    maxWidth: 440,
    marginTop: 10,
    color: '#52645D',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  detail: {
    maxWidth: 520,
    marginTop: 18,
    color: '#6B403A',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  button: {
    minWidth: 180,
    minHeight: 54,
    marginTop: 24,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F6B55',
    paddingHorizontal: 24,
  },
  buttonPressed: { opacity: 0.82 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
