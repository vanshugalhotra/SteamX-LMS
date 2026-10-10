const MIN_PASSWORD_CHARACTERS = 8;
const MAX_PASSWORD_CHARACTERS = 100;
const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'letmein123',
  'admin123',
  'welcome123',
  'iloveyou',
  '12345678',
  '123456789',
  '123123123',
]);

export const PASSWORD_POLICY_VIOLATION = {
  LENGTH: 'PASSWORD_LENGTH',
  WHITESPACE: 'PASSWORD_WHITESPACE',
  COMMON: 'PASSWORD_COMMON',
  CONTAINS_STEAMX_ID: 'PASSWORD_CONTAINS_STEAMX_ID',
} as const;

export type PasswordPolicyViolation =
  (typeof PASSWORD_POLICY_VIOLATION)[keyof typeof PASSWORD_POLICY_VIOLATION];

const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyViolation, string> = {
  [PASSWORD_POLICY_VIOLATION.LENGTH]: `Password must be between ${MIN_PASSWORD_CHARACTERS} and ${MAX_PASSWORD_CHARACTERS} characters.`,
  [PASSWORD_POLICY_VIOLATION.WHITESPACE]: 'Password must not start or end with whitespace.',
  [PASSWORD_POLICY_VIOLATION.COMMON]: 'Password is too common.',
  [PASSWORD_POLICY_VIOLATION.CONTAINS_STEAMX_ID]: 'Password must not contain your SteamX ID.',
};

export function getPasswordPolicyViolations(
  password: string,
  steamxId: string,
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  const characterCount = Array.from(password).length;

  if (characterCount < MIN_PASSWORD_CHARACTERS || characterCount > MAX_PASSWORD_CHARACTERS) {
    violations.push(PASSWORD_POLICY_VIOLATION.LENGTH);
  }

  if (password !== password.trim()) {
    violations.push(PASSWORD_POLICY_VIOLATION.WHITESPACE);
  }

  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    violations.push(PASSWORD_POLICY_VIOLATION.COMMON);
  }

  const normalizedSteamxId = steamxId.trim().toLowerCase();
  if (normalizedSteamxId.length > 0 && password.toLowerCase().includes(normalizedSteamxId)) {
    violations.push(PASSWORD_POLICY_VIOLATION.CONTAINS_STEAMX_ID);
  }

  return violations;
}

export function validatePasswordPolicy(password: string, steamxId: string): string[] {
  return getPasswordPolicyViolations(password, steamxId).map(
    (violation) => PASSWORD_POLICY_MESSAGES[violation],
  );
}
