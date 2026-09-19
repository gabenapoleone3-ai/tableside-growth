import crypto from 'node:crypto';
import { query } from '../db/pool.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_BLOCK_MS = 1000 * 60 * 15;
const MAX_LOGIN_FAILURES = 5;
const loginAttempts = new Map();

function safeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function bearer(req){const value=String(req.headers.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():'';}
function tokenHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex');}
function loginKey(req,email=''){const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();const remote=String(req?.socket?.remoteAddress||'unknown');return crypto.createHash('sha256').update(`${forwarded||remote}|${String(email).trim().toLowerCase()}`).digest('hex');}
function attemptState(key){const now=Date.now(),state=loginAttempts.get(key);if(!state)return {failures:0,windowStartedAt:now,blockedUntil:0};if(state.blockedUntil>now)return state;if(now-state.windowStartedAt>LOGIN_WINDOW_MS){loginAttempts.delete(key);return {failures:0,windowStartedAt:now,blockedUntil:0};}return state;}
export function loginAllowed(req,email=''){return attemptState(loginKey(req,email)).blockedUntil<=Date.now();}
export function recordLoginFailure(req,email=''){const key=loginKey(req,email),state=attemptState(key),failures=state.failures+1;loginAttempts.set(key,{failures,windowStartedAt:state.windowStartedAt,blockedUntil:failures>=MAX_LOGIN_FAILURES?Date.now()+LOGIN_BLOCK_MS:0});}
export function clearLoginFailures(req,email=''){loginAttempts.delete(loginKey(req,email));}
export function authConfigured(){return Boolean(process.env.PRIVATE_APP_OWNER_EMAIL&&process.env.PRIVATE_APP_PASSWORD);}

export async function loginOwner(email,password){
  if(!authConfigured())throw new Error('Private app authentication is not configured');
  const ownerEmail=String(process.env.PRIVATE_APP_OWNER_EMAIL).trim().toLowerCase(),suppliedEmail=String(email||'').trim().toLowerCase();
  if(!safeEqual(suppliedEmail,ownerEmail)||!safeEqual(password,process.env.PRIVATE_APP_PASSWORD))return null;
  const user=await query(`INSERT INTO users(email,display_name,role,last_login_at) VALUES($1,'TableSide Growth Owner','owner',now()) ON CONFLICT(email) DO UPDATE SET last_login_at=now() RETURNING id,email`,[ownerEmail]);
  const token=crypto.randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+SESSION_TTL_MS);
  await query('DELETE FROM private_sessions WHERE expires_at<=now()');
  await query('INSERT INTO private_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[user.rows[0].id,tokenHash(token),expiresAt]);
  return {token,email:ownerEmail,expiresAt:expiresAt.toISOString()};
}
export async function requireSession(req){
  const token=bearer(req);if(!token)return null;
  const r=await query(`SELECT s.user_id AS "userId",u.email,s.expires_at AS "expiresAt" FROM private_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,[tokenHash(token)]);
  if(!r.rowCount)return null;
  await query('UPDATE private_sessions SET last_seen_at=now() WHERE token_hash=$1',[tokenHash(token)]);
  return {token,...r.rows[0]};
}
export async function logout(req){const token=bearer(req);if(token)await query('DELETE FROM private_sessions WHERE token_hash=$1',[tokenHash(token)]);}
