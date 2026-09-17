import crypto from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_BLOCK_MS = 1000 * 60 * 15;
const MAX_LOGIN_FAILURES = 5;
const sessions = new Map();
const loginAttempts = new Map();

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
function loginKey(req,email='') {
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const remote=String(req?.socket?.remoteAddress||'unknown');
  return crypto.createHash('sha256').update(`${forwarded||remote}|${String(email).trim().toLowerCase()}`).digest('hex');
}
function attemptState(key){
  const now=Date.now(),state=loginAttempts.get(key);
  if(!state)return {failures:0,windowStartedAt:now,blockedUntil:0};
  if(state.blockedUntil>now)return state;
  if(now-state.windowStartedAt>LOGIN_WINDOW_MS){loginAttempts.delete(key);return {failures:0,windowStartedAt:now,blockedUntil:0};}
  return state;
}
export function loginAllowed(req,email='') {
  const state=attemptState(loginKey(req,email));
  return state.blockedUntil<=Date.now();
}
export function recordLoginFailure(req,email='') {
  const key=loginKey(req,email),state=attemptState(key),failures=state.failures+1;
  loginAttempts.set(key,{failures,windowStartedAt:state.windowStartedAt,blockedUntil:failures>=MAX_LOGIN_FAILURES?Date.now()+LOGIN_BLOCK_MS:0});
}
export function clearLoginFailures(req,email='') { loginAttempts.delete(loginKey(req,email)); }
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
  const token = bearer(req),session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) { sessions.delete(token); return null; }
  return { token, ...session };
}
export function logout(req) {
  const token = bearer(req);
  if (token) sessions.delete(token);
}
