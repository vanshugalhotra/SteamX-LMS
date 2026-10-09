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

export function validatePasswordPolicy(password: string, steamxId: string): string[] {
  const errors: string[] = [];
  const characterCount = Array.from(password).length;

  if (characterCount < MIN_PASSWORD_CHARACTERS || characterCount > MAX_PASSWORD_CHARACTERS) {
    errors.push(
      `Password must be between ${MIN_PASSWORD_CHARACTERS} and ${MAX_PASSWORD_CHARACTERS} characters.`,
    );
  }

  if (password !== password.trim()) {
    errors.push('Password must not start or end with whitespace.');
  }

  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common.');
  }

  const normalizedSteamxId = steamxId.trim().toLowerCase();
  if (normalizedSteamxId.length > 0 && password.toLowerCase().includes(normalizedSteamxId)) {
    errors.push('Password must not contain your SteamX ID.');
  }

  return errors;
}
