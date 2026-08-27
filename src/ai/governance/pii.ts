import type { AiMessage } from "../types";
import type { AiPiiField } from "./types";

export interface PiiMatch {
  field: AiPiiField;
  value: string;
}

const PATTERNS: Record<AiPiiField, RegExp> = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]?){13,16}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  address: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+)*(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct))\b/gi,
};

export const ALL_PII_FIELDS: AiPiiField[] = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ip_address",
  "address",
];

export function detectPii(text: string, fields: AiPiiField[]): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const field of fields) {
    const regex = PATTERNS[field];
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      matches.push({ field, value: match[0] });
    }
  }
  return matches;
}

export function redactPii(text: string, fields: AiPiiField[]): { text: string; matches: PiiMatch[] } {
  const matches = detectPii(text, fields);
  let redacted = text;
  for (const match of matches) {
    redacted = redacted.split(match.value).join(`[${match.field}]`);
  }
  return { text: redacted, matches };
}

export function redactMessages(
  messages: AiMessage[],
  fields: AiPiiField[],
): { messages: AiMessage[]; redactions: PiiMatch[] } {
  const redactions: PiiMatch[] = [];
  const next = messages.map((m) => {
    const result = redactPii(m.content, fields);
    redactions.push(...result.matches);
    return { ...m, content: result.text };
  });
  return { messages: next, redactions };
}
