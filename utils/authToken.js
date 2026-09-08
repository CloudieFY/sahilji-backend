/**
 * Lightweight stateless auth token (HMAC-signed, no external deps).
 *
 * Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, secret))
 *
 * The payload carries { id, role, name, exp }. Because it is signed with a
 * server-only secret, the role inside it cannot be forged by the client the way
 * the old `x-user-role` header could.
 */
const crypto = require('crypto');

const SECRET =
  process.env.AUTH_SECRET ||
  // Fallback keeps dev working; set AUTH_SECRET in .env for production.
  'change-me-please-set-AUTH_SECRET-in-env';

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function signToken(payload = {}) {
  const body = { ...payload, exp: Date.now() + TTL_MS };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  if (!body.exp || Date.now() > Number(body.exp)) return null;
  return body;
}

module.exports = { signToken, verifyToken };
