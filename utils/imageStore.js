/**
 * Image persistence: keeps heavy binary out of MongoDB.
 *
 * Callers hand us whatever the client sent for an image field. We:
 *   - pass through empty values and values that are already URLs
 *     ("/uploads/...", "http(s)://...")
 *   - decode base64 `data:` URIs, downscale + re-encode them with sharp
 *     (max 1000px, JPEG q78), write them to disk under uploads/items/, and
 *     return the public "/uploads/items/<name>.jpg" path
 *
 * On any failure we return the original string so a save never breaks because
 * of image processing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (err) {
  console.warn('[imageStore] sharp not available, images will be stored as-is:', err.message);
}

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'items');
const PUBLIC_PREFIX = '/uploads/items';
const MAX_DIM = 1000;
const JPEG_QUALITY = 78;

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
ensureDir();

const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+)?;base64,([\s\S]+)$/;

function isProcessablyDataUri(value) {
  return typeof value === 'string' && DATA_URI_RE.test(value.trim());
}

/**
 * @param {string} input        raw image value from the client
 * @returns {Promise<string>}   a "/uploads/..." path, an untouched URL, or ""
 */
async function persistImage(input) {
  if (!input || typeof input !== 'string') return '';
  const value = input.trim();
  if (!value) return '';

  // Already a stored/remote reference — leave it alone.
  if (value.startsWith(PUBLIC_PREFIX) || /^https?:\/\//i.test(value) || value.startsWith('/uploads/')) {
    return value;
  }

  const match = value.match(DATA_URI_RE);
  if (!match) {
    // Unknown format (e.g. a bare path). Return as-is; nothing to persist.
    return value;
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch (err) {
    console.warn('[imageStore] base64 decode failed, keeping original:', err.message);
    return value;
  }
  if (!buffer.length) return '';

  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const filePath = path.join(UPLOAD_DIR, name);

  try {
    ensureDir();
    if (sharp) {
      await sharp(buffer)
        .rotate()
        .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(filePath);
    } else {
      fs.writeFileSync(filePath, buffer);
    }
    return `${PUBLIC_PREFIX}/${name}`;
  } catch (err) {
    console.error('[imageStore] failed to write image, keeping original:', err.message);
    return value;
  }
}

/**
 * @param {string[]} arr
 * @returns {Promise<string[]>}
 */
async function persistImages(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const entry of arr) {
    // eslint-disable-next-line no-await-in-loop
    const stored = await persistImage(entry);
    if (stored) out.push(stored);
  }
  return out;
}

module.exports = { persistImage, persistImages, isProcessablyDataUri, UPLOAD_DIR, PUBLIC_PREFIX };
