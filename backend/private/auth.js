import crypto from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function authConfigured() {
  return Boolean(process.env.PRIVATE_APP_OWNER_EMAIL && process.env.PRIVATE_APP_PASSWORD);
}

export function loginOwner(email, password) {
  if (!authConfigured()) throw new Error('Private app authentication is not configured');
  const ownerEmail = String(process.env.PRIVATE_APP_OWNER_EMAIL).trim().toLowerCase();
  const suppliedEmail = String(email || '').trim().toLowerCase();
  if (!safeEqual(suppliedEmail, ownerEmail) || !safeEqual(password, process.env.PRIVATE_APP_PASSWORD)) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { email: ownerEmail, expiresAt });
  return { token, email: ownerEmail, expiresAt: new Date(expiresAt).toISOString() };
}

export function requireSession(req) {
  const token = bearer(req);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

export function logout(req) {
  const token = bearer(req);
  if (token) sessions.delete(token);
}
