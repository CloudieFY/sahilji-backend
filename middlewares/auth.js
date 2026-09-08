const { verifyToken } = require('../utils/authToken');

// When STRICT_AUTH=true, the legacy spoofable `x-user-role` header is ignored
// and only a valid signed token is trusted. Default is off so existing logged-in
// clients keep working until everyone has re-logged-in with the new flow.
const STRICT = String(process.env.STRICT_AUTH || '').trim().toLowerCase() === 'true';

/**
 * Resolve the caller's role from (in order of trust):
 *   1. A valid `Authorization: Bearer <token>` (signed, not forgeable).
 *   2. Legacy `x-user-role` header — only when STRICT_AUTH is not enabled.
 */
function resolveAuth(req) {
  const header = req.get('authorization') || req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const payload = verifyToken(bearer);

  if (payload && payload.role) {
    return {
      role: String(payload.role).trim().toLowerCase(),
      userId: payload.id,
      name: payload.name,
      source: 'token',
    };
  }

  if (!STRICT) {
    const legacy = String(req.get('x-user-role') || req.headers['x-user-role'] || '')
      .trim()
      .toLowerCase();
    if (legacy) return { role: legacy, source: 'legacy-header' };
  }

  return { role: '', source: 'none' };
}

module.exports = { resolveAuth, STRICT_AUTH: STRICT };
