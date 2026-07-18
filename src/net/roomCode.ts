/** Crockford base32 alphabet (no I/L/O/U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRoomCode(length = 6): string {
  let code = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length < 4 || code.length > 8) return false;
  for (let i = 0; i < code.length; i++) {
    if (!ALPHABET.includes(code[i]!)) return false;
  }
  return true;
}
