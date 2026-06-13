/**
 * Minimal intrinsic-dimension sniffing for the image formats a chat client
 * actually receives.
 *
 * Reading width and height from the header lets the renderer reserve the exact
 * box an image will occupy, so a loading attachment does not shift the message
 * list as it decodes. A dedicated image library would be several megabytes of
 * dependency for what is a handful of byte offsets.
 */

export interface Dimensions {
  width: number;
  height: number;
}

export function readImageSize(buffer: Buffer, mimeType: string): Dimensions | null {
  try {
    if (mimeType === 'image/png') return readPng(buffer);
    if (mimeType === 'image/jpeg') return readJpeg(buffer);
    if (mimeType === 'image/gif') return readGif(buffer);
    if (mimeType === 'image/webp') return readWebp(buffer);
    return null;
  } catch {
    // A malformed or truncated header is not an error worth failing the upload
    // over — the client simply falls back to its default aspect box.
    return null;
  }
}

/** PNG: the IHDR chunk always starts at byte 16. */
function readPng(buffer: Buffer): Dimensions | null {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** GIF: little-endian width/height at bytes 6–9. */
function readGif(buffer: Buffer): Dimensions | null {
  if (buffer.length < 10) return null;
  const signature = buffer.toString('ascii', 0, 3);
  if (signature !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/** WebP: VP8 / VP8L / VP8X each store dimensions differently. */
function readWebp(buffer: Buffer): Dimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  const format = buffer.toString('ascii', 12, 16);

  if (format === 'VP8X') {
    // Extended format: 24-bit width-1 / height-1, little-endian.
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }

  if (format === 'VP8 ') {
    // Lossy: 14-bit dimensions following the 3-byte start code.
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (format === 'VP8L') {
    // Lossless: 14 bits each, packed across four bytes after the signature.
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  return null;
}

/**
 * JPEG: walk the marker chain until a Start-Of-Frame segment, whose payload
 * carries the dimensions. There is no fixed offset — any number of metadata
 * segments (EXIF, ICC, comments) may precede the frame.
 */
function readJpeg(buffer: Buffer): Dimensions | null {
  if (buffer.length < 4) return null;
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1]!;

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: pixel data begins, no frame header will follow.
    if (marker === 0xda) return null;

    const length = buffer.readUInt16BE(offset + 2);

    // SOF0/1/2/3/5/6/7/9/10/11/13/14/15 — excluding DHT (0xc4), JPG (0xc8)
    // and DAC (0xcc), which share the 0xc_ range but are not frame headers.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    offset += 2 + length;
  }

  return null;
}
