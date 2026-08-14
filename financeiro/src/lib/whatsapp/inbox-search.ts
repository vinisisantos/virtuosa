export const INBOX_SEARCH_MIN_TEXT_LENGTH = 3;
export const INBOX_SEARCH_MIN_PHONE_DIGITS = 4;
export const INBOX_SEARCH_MAX_LENGTH = 120;

export type InboxSearchQuery = {
  text: string;
  digits: string;
  textPattern: string | null;
  digitsPattern: string | null;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function escapePostgresLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function parseInboxSearchQuery(value?: string | null): InboxSearchQuery | null {
  const text = normalizeWhitespace(value || "").slice(0, INBOX_SEARCH_MAX_LENGTH);
  if (!text) return null;

  const digits = text.replace(/\D/g, "");
  const canSearchText = /\p{L}/u.test(text) && text.length >= INBOX_SEARCH_MIN_TEXT_LENGTH;
  const canSearchPhone = digits.length >= INBOX_SEARCH_MIN_PHONE_DIGITS;

  if (!canSearchText && !canSearchPhone) return null;

  return {
    text,
    digits,
    textPattern: canSearchText ? `%${escapePostgresLikePattern(text)}%` : null,
    digitsPattern: canSearchPhone ? `%${escapePostgresLikePattern(digits)}%` : null,
  };
}
