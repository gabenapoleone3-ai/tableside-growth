import crypto from 'node:crypto';
import { query } from '../db/pool.js';

const REDIRECT_URI='https://tableside-ai-backend-production.up.railway.app/api/private/gmail/oauth/callback';
const SCOPES=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'];

const clean=(v,max=6000)=>String(v??'').trim().slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

function key(){
  const raw=Buffer.from(String(process.env.GMAIL_TOKEN_ENCRYPTION_KEY||''),'base64');
  if(raw.length!==32)throw new Error('Gmail token encryption is not configured correctly');
  return raw;
}
function encrypt(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
function decrypt(value){
  const [iv,tag,data]=String(value||'').split('.');
  if(!iv||!tag||!data)throw new Error('Stored Gmail credential is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
function configured(){return Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY);}

export async function beginGmailOAuth(userId){
  if(!configured())throw new Error('Server-side Gmail OAuth is not configured');
  const state=crypto.randomBytes(32).toString('base64url');
  await query('DELETE FROM gmail_oauth_states WHERE expires_at<=now()');
  await query(`INSERT INTO gmail_oauth_states(state_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')`,[sha(state),userId]);
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id',process.env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri',REDIRECT_URI);
  u.searchParams.set('response_type','code');
  u.searchParams.set('scope',SCOPES.join(' '));
  u.searchParams.set('access_type','offline');
  u.searchParams.set('prompt','consent');
  u.searchParams.set('state',state);
  return u.toString();
}
export async function finishGmailOAuth(code,state){
  if(!configured())throw new Error('Server-side Gmail OAuth is not configured');
  const client=await query(`DELETE FROM gmail_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING user_id AS "userId"`,[sha(state)]);
  if(!client.rowCount)throw new Error('Gmail connection request expired or is invalid');
  const body=new URLSearchParams({code:clean(code),client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:REDIRECT_URI,grant_type:'authorization_code'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const token=await response.json().catch(()=>({}));
  if(!response.ok||!token.refresh_token)throw new Error(token?.error_description||'Google did not return a refresh token');
  const profileResponse=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${token.access_token}`}});
  const profile=await profileResponse.json().catch(()=>({}));
  if(!profileResponse.ok)throw new Error('Could not verify connected Gmail account');
  await query(`INSERT INTO gmail_connections(user_id,google_email,encrypted_refresh_token,scopes,connected_at,updated_at)
    VALUES($1,$2,$3,$4,now(),now())
    ON CONFLICT(user_id) DO UPDATE SET google_email=excluded.google_email,encrypted_refresh_token=excluded.encrypted_refresh_token,scopes=excluded.scopes,connected_at=now(),updated_at=now()`,
    [client.rows[0].userId,clean(profile.emailAddress,320),encrypt(token.refresh_token),clean(token.scope,2000)]);
  return {email:clean(profile.emailAddress,320)};
}
export async function gmailStatus(userId){
  const r=await query(`SELECT google_email AS email,connected_at AS "connectedAt" FROM gmail_connections WHERE user_id=$1`,[userId]);
  return r.rowCount?{connected:true,...r.rows[0]}:{connected:false};
}
export async function gmailAccessTokenFor(userId){
  const r=await query('SELECT encrypted_refresh_token FROM gmail_connections WHERE user_id=$1',[userId]);
  if(!r.rowCount)throw new Error('Connect Gmail first');
  const body=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:decrypt(r.rows[0].encrypted_refresh_token),grant_type:'refresh_token'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(data?.error_description||'Could not refresh Gmail access');
  return data.access_token;
}
export async function disconnectGmail(userId){await query('DELETE FROM gmail_connections WHERE user_id=$1',[userId]);}
