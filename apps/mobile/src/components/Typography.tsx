import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';

export function Text({ style, ...props }: TextProps) {
  return <NativeText maxFontSizeMultiplier={2} {...props} style={[styles.font, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeTextInput maxFontSizeMultiplier={2} {...props} style={[styles.font, style]} />;
}

const styles = StyleSheet.create({
  font: { fontFamily: 'GoogleSansFlex', fontSize: 16 },
});
