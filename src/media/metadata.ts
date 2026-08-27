export interface ImageMetadata {
  width: number;
  height: number;
}

export function imageSize(buffer: Buffer): ImageMetadata | undefined {
  if (isPng(buffer)) return pngSize(buffer);
  if (isJpeg(buffer)) return jpegSize(buffer);
  if (isGif(buffer)) return gifSize(buffer);
  if (isBmp(buffer)) return bmpSize(buffer);
  if (isWebp(buffer)) return webpSize(buffer);
  return undefined;
}

function isPng(b: Buffer): boolean {
  return b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function pngSize(b: Buffer): ImageMetadata {
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function isJpeg(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function jpegSize(b: Buffer): ImageMetadata | undefined {
  let pos = 2;
  while (pos + 8 < b.length) {
    if (b[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = b[pos + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      pos += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = b.readUInt16BE(pos + 5);
      const width = b.readUInt16BE(pos + 7);
      return { width, height };
    }
    const length = b.readUInt16BE(pos + 2);
    pos += 2 + length;
  }
  return undefined;
}

function isGif(b: Buffer): boolean {
  return (
    b.length >= 10 &&
    (b.subarray(0, 6).equals(Buffer.from("GIF89a")) || b.subarray(0, 6).equals(Buffer.from("GIF87a")))
  );
}

function gifSize(b: Buffer): ImageMetadata {
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function isBmp(b: Buffer): boolean {
  return b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d;
}

function bmpSize(b: Buffer): ImageMetadata {
  return { width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
}

function isWebp(b: Buffer): boolean {
  return b.length >= 30 && b.subarray(0, 4).equals(Buffer.from("RIFF")) && b.subarray(8, 12).equals(Buffer.from("WEBP"));
}

function readUInt24(b: Buffer, offset: number): number {
  return (b[offset] << 16) | (b[offset + 1] << 8) | b[offset + 2];
}

function webpSize(b: Buffer): ImageMetadata | undefined {
  const format = b.toString("latin1", 12, 16);
  if (format === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const value = b.readUInt32LE(21);
    return { width: (value & 0x3fff) + 1, height: ((value >>> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    return { width: 1 + readUInt24(b, 24), height: 1 + readUInt24(b, 27) };
  }
  return undefined;
}
