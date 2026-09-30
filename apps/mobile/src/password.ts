export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: '9 or more characters', test: (value: string) => value.length >= 9 },
  { key: 'letterNumber', label: 'At least one letter and one number', test: (value: string) => /[A-Za-z]/.test(value) && /\d/.test(value) },
  { key: 'case', label: 'At least one uppercase and one lowercase letter', test: (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value) },
  { key: 'special', label: 'At least one special character (for example ! # $)', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function isStrongPassword(value: string) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(value));
}

export function passwordIssue(value: string) {
  return PASSWORD_REQUIREMENTS.find((requirement) => !requirement.test(value))?.label ?? null;
}
