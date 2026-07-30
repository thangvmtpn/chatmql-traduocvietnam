// Vietnam phone normalization for ZNS sends + Contact upsert.
// Output: 84xxxxxxxxx (11 digits starting with 84).
// Accepts: 0xxxxxxxxx, +84xxxxxxxxx, 84xxxxxxxxx, with separators.

export class PhoneFormatError extends Error {
  constructor(public input: string, msg: string) {
    super(`Invalid phone "${input}": ${msg}`);
    this.name = 'PhoneFormatError';
  }
}

export function normalizePhone(input: string): string {
  if (!input) throw new PhoneFormatError(input, 'empty');
  let digits = input.replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '84' + digits.slice(1);
  if (digits.length === 9) digits = '84' + digits;
  if (!digits.startsWith('84')) {
    throw new PhoneFormatError(input, 'must start with 84/0/+84');
  }
  if (digits.length !== 11) {
    throw new PhoneFormatError(input, `expected 11 digits, got ${digits.length}`);
  }
  return digits;
}

export function tryNormalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}
