const GOOGLE_CLIENT_ID = '132639238915-cgna5936vo7kniqgqi0pi3iqapgq9msq.apps.googleusercontent.com';
const GMAIL_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

let gmailTokenClient;
let gmailGapiReady = false;
let gmailGisReady = false;
const sendAuthorizations = new Map();

function gapiLoaded() { gapi.load('client', initializeGmailClient); }

async function initializeGmailClient() {
  try {
    await gapi.client.init({ discoveryDocs: [GMAIL_DISCOVERY_DOC] });
    gmailGapiReady = true;
  } catch (error) { console.error('Gmail client initialization failed:', error); }
}

function gisLoaded() {
  try {
    gmailTokenClient = google.accounts.oauth2.initTokenClient({client_id: GOOGLE_CLIENT_ID, scope: GMAIL_SCOPES, callback: ''});
    gmailGisReady = true;
  } catch (error) { console.error('Google Identity initialization failed:', error); }
}

function gmailIsConnected() { return Boolean(window.gapi?.client?.getToken?.()); }
window.gmailIsConnected = gmailIsConnected;

function authorizeSingleEmail(to, subject, body) {
  if (!to || !subject || !body) return null;
  const token = crypto.randomUUID();
  sendAuthorizations.set(token, {to, subject, body, createdAt: Date.now()});
  setTimeout(() => sendAuthorizations.delete(token), 60000);
  return token;
}
window.authorizeSingleEmail = authorizeSingleEmail;

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendApprovedEmail(to, subject, body, authorizationToken) {
  const authorization = sendAuthorizations.get(authorizationToken);
  sendAuthorizations.delete(authorizationToken);

  if (!authorization || authorization.to !== to || authorization.subject !== subject || authorization.body !== body) {
    alert('Send blocked: this exact email was not explicitly authorized.');
    return false;
  }
  if (Date.now() - authorization.createdAt > 60000) {
    alert('Send blocked: authorization expired. Approve the email again.');
    return false;
  }
  if (!gmailIsConnected()) { alert('Connect Gmail first.'); return false; }
  if (!to || !subject || !body) { alert('Email is missing a recipient, subject, or body.'); return false; }

  const message = [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\r\n');
  try {
    await gapi.client.gmail.users.messages.send({userId: 'me', resource: {raw: encodeBase64Url(message)}});
    if (typeof log === 'function') log(`Email sent to ${to}`);
    alert('Email sent successfully.');
    return true;
  } catch (error) {
    console.error('Gmail send failed:', error);
    alert('Email send failed. Check the browser console.');
    return false;
  }
}

async function testGmail() {
  if (!gmailIsConnected()) return alert('Connect Gmail first.');
  try {
    const response = await gapi.client.gmail.users.getProfile({userId: 'me'});
    const profile = response.result;
    alert(`Gmail connected.\n\nEmail: ${profile.emailAddress}\nMessages: ${profile.messagesTotal}\nThreads: ${profile.threadsTotal}`);
    if (typeof log === 'function') log(`Gmail test passed for ${profile.emailAddress}`);
  } catch (error) { console.error('Gmail test failed:', error); alert('Gmail test failed. Check the browser console.'); }
}

function connectGmail() {
  if (!gmailGapiReady || !gmailGisReady) return alert('Google services are still loading. Try again in a few seconds.');
  gmailTokenClient.callback = response => {
    if (response.error) { console.error('Gmail connection failed:', response); alert('Gmail connection failed.'); return; }
    alert('Gmail connected successfully.');
    if (typeof log === 'function') log('Gmail connected');
  };
  gmailTokenClient.requestAccessToken({prompt: gmailIsConnected() ? '' : 'consent'});
}
