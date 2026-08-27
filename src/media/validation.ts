import { ValidationError } from "../kernel/errors";
import type { MediaKind } from "../content/types";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

interface MagicRule {
  mime: string;
  kind: MediaKind;
  test: (buffer: Buffer) => boolean;
}

const MAGIC: MagicRule[] = [
  {
    mime: "image/png",
    kind: "image",
    test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    kind: "image",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    kind: "image",
    test: (b) =>
      b.length >= 6 &&
      (b.subarray(0, 6).equals(Buffer.from("GIF89a")) || b.subarray(0, 6).equals(Buffer.from("GIF87a"))),
  },
  {
    mime: "image/webp",
    kind: "image",
    test: (b) => b.length >= 12 && b.subarray(0, 4).equals(Buffer.from("RIFF")) && b.subarray(8, 12).equals(Buffer.from("WEBP")),
  },
  {
    mime: "image/bmp",
    kind: "image",
    test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d,
  },
  {
    mime: "application/pdf",
    kind: "file",
    test: (b) => b.length >= 5 && b.subarray(0, 5).equals(Buffer.from("%PDF-")),
  },
  {
    mime: "audio/mpeg",
    kind: "audio",
    test: (b) =>
      (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
      (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  {
    mime: "audio/wav",
    kind: "audio",
    test: (b) => b.length >= 12 && b.subarray(0, 4).equals(Buffer.from("RIFF")) && b.subarray(8, 12).equals(Buffer.from("WAVE")),
  },
  {
    mime: "video/mp4",
    kind: "video",
    test: (b) => b.length >= 12 && b.subarray(4, 8).equals(Buffer.from("ftyp")),
  },
];

export function detectMime(buffer: Buffer): string | undefined {
  for (const rule of MAGIC) {
    try {
      if (rule.test(buffer)) return rule.mime;
    } catch {
      // ignore
    }
  }
  return undefined;
}

export function detectKind(mime: string): MediaKind | undefined {
  return MAGIC.find((rule) => rule.mime === mime)?.kind;
}

export interface ValidatedFile {
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
}

export function validateUpload(buffer: Buffer, declaredMime?: string): ValidatedFile {
  if (!buffer || buffer.length === 0) throw new ValidationError("Empty upload");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`File exceeds the ${MAX_UPLOAD_BYTES} byte upload limit`);
  }
  const mimeType = detectMime(buffer) ?? declaredMime;
  if (!mimeType) throw new ValidationError("Unsupported file type");
  const kind = detectKind(mimeType);
  if (!kind) throw new ValidationError(`Unsupported file type ${mimeType}`);
  return { mimeType, kind, sizeBytes: buffer.length };
}
