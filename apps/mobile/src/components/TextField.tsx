import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Text, TextInput } from './Typography';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function TextField({ label, value, onChangeText, placeholder, secure, keyboardType, error, icon }: Props) {
  const [hidden, setHidden] = useState(secure);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.focused, error ? styles.error : null]}>
        {icon && <Ionicons name={icon} size={20} color={colors.inkMuted} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#85978F"
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
          accessibilityLabel={label}
          accessibilityHint={secure ? 'Enter your account password' : 'Enter the email address for your novo account'}
          autoComplete={secure ? 'current-password' : keyboardType === 'email-address' ? 'email' : undefined}
          textContentType={secure ? 'password' : keyboardType === 'email-address' ? 'emailAddress' : 'none'}
        />
        {secure && (
          <Pressable onPress={() => setHidden((current) => !current)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} style={styles.visibilityButton}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={21} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>
      {error && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: colors.ink, fontSize: 16, fontWeight: '700', marginLeft: 2 },
  field: { minHeight: 56, borderRadius: 18, borderWidth: 1.5, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  focused: { borderColor: colors.forest, borderWidth: 2, backgroundColor: '#FCFFF4' },
  error: { borderColor: colors.danger },
  input: { flex: 1, color: colors.ink, fontSize: 16, paddingVertical: 14, outlineStyle: 'none' } as never,
  visibilityButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18, marginLeft: 4 },
});
