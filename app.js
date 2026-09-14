const KEY = 'tableside_growth_pwa_v1';

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  prospects: [],
  tasks: [],
  approvals: [],
  clients: [],
  activity: [],
  revenue: 0,
  selected: null,
  selectedApproval: null,
  agent: 'STOPPED',
  dailyLimit: 10,
  completedToday: 0,
  lastDay: new Date().toISOString().slice(0, 10)
};

state.prospects ||= [];
state.tasks ||= [];
state.approvals ||= [];
state.clients ||= [];
state.activity ||= [];
state.revenue ||= 0;
state.agent ||= 'STOPPED';
state.dailyLimit ||= 10;
state.completedToday ||= 0;
state.lastDay ||= new Date().toISOString().slice(0, 10);
state.selectedApproval ||= null;

let timer = null;

const tabs = ['prospects', 'agent', 'approvals', 'drafts', 'clients', 'activity', 'control'];
const labels = {
  prospects: 'Prospects',
  agent: 'Agent Control',
  approvals: 'Approvals',
  drafts: 'Draft',
  clients: 'Clients',
  activity: 'Activity',
  control: 'Control & Safety'
};

document.getElementById('nav').innerHTML = tabs
  .map(t => `<button class="secondary" onclick="showTab('${t}')">${labels[t]}</button>`)
  .join('');

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function log(msg) {
  state.activity.unshift(`${new Date().toLocaleString()} — ${msg}`);
  state.activity = state.activity.slice(0, 100);
  save();
}

function showTab(id) {
  document.querySelectorAll('.tabs>section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function defaultOutreachBody(p) {
  return `Hi,\n\nI came across ${p.business} and had a quick idea that could help with customer growth.\n\nI put together a short, free audit with a few specific suggestions for the business. If you're interested, I can send it over.\n\nThanks,\nGabe\nTableSide Growth`;
}

function buildInternalPackage(p, body) {
  return `TABLESIDE GROWTH — OUTREACH PACKAGE\n\nBusiness: ${p.business}\n\nAUDIT DRAFT\n1. Identify what customers already like about ${p.business}.\n2. Pick one clear reason for a new customer to visit.\n3. Build one repeatable weekly campaign.\n4. Use customer feedback and reviews as social proof.\n5. Measure enquiries, visits/orders where trackable, saves, shares and profile actions.\n\n30-DAY TEST\nWeek 1 — Research and select strongest opportunity\nWeek 2 — Build campaign and supporting content ideas\nWeek 3 — Launch after client approval\nWeek 4 — Review response and improve\n\nOUTREACH DRAFT\n${body}\n\nSTATUS\nPrepared locally. Human approval required before anything is sent.`;
}

function extractLegacyBody(payload = '') {
  if (!payload) return '';
  const outreachMarker = 'OUTREACH DRAFT';
  const statusMarker = 'STATUS';
  let body = payload;
  if (payload.includes(outreachMarker)) {
    body = payload.split(outreachMarker)[1] || '';
    if (body.includes(statusMarker)) body = body.split(statusMarker)[0];
  }
  return body.trim();
}

function normalizeApproval(a) {
  const p = state.prospects.find(x => x.id === a.prospectId);
  if (!a.subject) a.subject = `Quick question about ${p?.business || 'your business'}`;
  if (!a.body) a.body = extractLegacyBody(a.payload) || (p ? defaultOutreachBody(p) : '');
  if (!a.package && a.payload) a.package = a.payload;
  return a;
}

function addProspect() {
  const p = {
    id: Date.now(),
    business: business.value.trim(),
    city: city.value.trim(),
    website: website.value.trim(),
    instagram: instagram.value.trim(),
    email: email.value.trim(),
    notes: notes.value.trim(),
    status: 'New'
  };

  if (!p.business) return alert('Enter a business name.');

  state.prospects.unshift(p);
  ['business', 'city', 'website', 'instagram', 'email', 'notes']
    .forEach(id => document.getElementById(id).value = '');
  log(`Added prospect: ${p.business}`);
}

function setStatus(id, status) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;
  p.status = status;
  log(`${p.business} → ${status}`);
}

function selectP(id) {
  state.selected = id;
  state.selectedApproval = null;
  save();
}

function queue(id) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;

  const existing = state.tasks.find(t =>
    t.prospectId === id && ['Queued', 'Working', 'Awaiting Approval'].includes(t.status)
  );

  if (existing) {
    alert('This prospect already has active outreach work in the queue.');
    return;
  }

  state.tasks.push({
    id: Date.now(),
    prospectId: id,
    task: 'Prepare outreach package',
    status: 'Queued'
  });
  log(`Queued outreach package for ${p.business}`);
}

function makeDraft(id) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;
  state.selected = id;
  state.selectedApproval = null;
  workingDraft.value = defaultOutreachBody(p);
  showTab('drafts');
  save();
}

function startAgent() {
  resetDay();
  if (state.agent === 'RUNNING') return;
  state.agent = 'RUNNING';
  log('Agent started');
  if (timer) clearInterval(timer);
  timer = setInterval(agentTick, 1200);
}

function pauseAgent() {
  state.agent = 'PAUSED';
  log('Agent paused');
}

function stopAgent() {
  state.agent = 'STOPPED';
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  log('Agent stopped');
}

function emergencyStop() {
  state.agent = 'STOPPED';
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  log('EMERGENCY STOP activated');
  alert('Agent stopped. It will not take another queued task until you press START AGENT.');
}

function resetDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (state.lastDay !== d) {
    state.lastDay = d;
    state.completedToday = 0;
  }
}

function agentTick() {
  resetDay();
  if (state.agent !== 'RUNNING') return;

  if (state.completedToday >= state.dailyLimit) {
    stopAgent();
    log('Daily task limit reached');
    return;
  }

  const t = state.tasks.find(x => x.status === 'Queued');
  if (!t) return;

  const p = state.prospects.find(x => x.id === t.prospectId);
  if (!p) {
    t.status = 'Error';
    save();
    return;
  }

  t.status = 'Working';
  save();

  setTimeout(() => {
    const body = defaultOutreachBody(p);
    const subject = `Quick question about ${p.business}`;
    const packageText = buildInternalPackage(p, body);

    t.status = 'Awaiting Approval';
    state.completedToday++;
    state.approvals.unshift({
      id: Date.now(),
      prospectId: p.id,
      action: 'Outbound outreach',
      status: 'Pending',
      subject,
      body,
      package: packageText
    });
    state.activity.unshift(`${new Date().toLocaleString()} — Agent finished package for ${p.business} — awaiting approval`);
    save();
  }, 800);
}

function loadApproval(id) {
  const a = state.approvals.find(x => x.id === id);
  if (!a) return;
  normalizeApproval(a);
  state.selected = a.prospectId;
  state.selectedApproval = a.id;
  workingDraft.value = a.body;
  showTab('drafts');
  save();
}

function saveLoadedDraft() {
  if (!state.selectedApproval) {
    alert('Load a pending approval first.');
    return;
  }

  const a = state.approvals.find(x => x.id === state.selectedApproval);
  if (!a) return alert('Approval not found.');
  if (a.status !== 'Pending') return alert('Only pending approvals can be edited.');

  const body = workingDraft.value.trim();
  if (!body) return alert('Draft cannot be empty.');

  normalizeApproval(a);
  a.body = body;
  const p = state.prospects.find(x => x.id === a.prospectId);
  if (p) a.package = buildInternalPackage(p, body);
  log(`Saved outreach draft for ${p?.business || 'prospect'}`);
}

async function approve(id) {
  const a = state.approvals.find(x => x.id === id);
  if (!a) return;
  normalizeApproval(a);

  if (a.status !== 'Pending') {
    alert(`This approval is already ${a.status}.`);
    return;
  }

  const p = state.prospects.find(x => x.id === a.prospectId);
  if (!p) return alert('Prospect not found.');
  if (!p.email) return alert('This prospect does not have an email address.');
  if (!window.gmailIsConnected || !window.gmailIsConnected()) return alert('Connect Gmail first.');
  if (!a.body || !a.body.trim()) return alert('This approval has no email draft.');

  const confirmed = confirm(
    `Send this approved email?\n\nTo: ${p.email}\nSubject: ${a.subject}\n\nYou can edit the message first by pressing Load.`
  );
  if (!confirmed) return;

  a.status = 'Sending';
  save();

  const sent = await sendApprovedEmail(p.email, a.subject, a.body.trim());

  if (!sent) {
    a.status = 'Pending';
    save();
    return;
  }

  a.status = 'Sent';
  p.status = 'Contacted';
  log(`Approved and sent outreach to ${p.business}`);
}

function reject(id) {
  const a = state.approvals.find(x => x.id === id);
  if (!a) return;
  if (a.status !== 'Pending') return;

  a.status = 'Rejected';
  const p = state.prospects.find(x => x.id === a.prospectId);
  log(`Rejected outbound outreach for ${p?.business || 'prospect'}`);
}

async function copyDraft() {
  try {
    await navigator.clipboard.writeText(workingDraft.value);
    log('Copied draft');
  } catch (e) {
    alert('Copy failed. Select the text and copy manually.');
  }
}

function openGmail() {
  const p = state.prospects.find(x => x.id === state.selected);
  if (!p) return alert('Select a prospect first.');
  if (!p.email) return alert('This prospect has no public business email saved.');

  const body = workingDraft.value.trim();
  if (!body) return alert('No draft loaded.');

  const approval = state.selectedApproval
    ? state.approvals.find(x => x.id === state.selectedApproval)
    : null;
  if (approval) normalizeApproval(approval);

  const subject = approval?.subject || `Quick question about ${p.business}`;
  const u = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(p.email)
    + '&su=' + encodeURIComponent(subject)
    + '&body=' + encodeURIComponent(body);

  window.open(u, '_blank');
  log(`Opened Gmail compose for ${p.business}`);
}

function makeClient(id) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;
  if (!state.clients.find(x => x.prospectId === id)) {
    state.clients.push({ prospectId: id, business: p.business, status: 'Active', revenue: 0 });
  }
  p.status = 'Client';
  log(`Promoted ${p.business} to client`);
}

function addRevenue(id) {
  const c = state.clients.find(x => x.prospectId === id);
  if (!c) return;
  const v = Number(prompt('Revenue amount:'));
  if (!Number.isFinite(v) || v < 0) return;
  c.revenue += v;
  state.revenue += v;
  log(`Recorded $${v.toFixed(2)} revenue from ${c.business}`);
}

function saveConfig() {
  state.dailyLimit = Math.max(1, Math.min(100, Number(dailyLimit.value) || 10));
  save();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tableside-growth-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
  log('Exported data');
}

function render() {
  state.approvals.forEach(normalizeApproval);

  document.getElementById('agentStatus').textContent = state.agent;
  sProspects.textContent = state.prospects.length;
  sContacted.textContent = state.prospects.filter(x => x.status === 'Contacted').length;
  sInterested.textContent = state.prospects.filter(x => x.status === 'Interested').length;
  sRevenue.textContent = '$' + state.revenue.toFixed(2);
  dailyLimit.value = state.dailyLimit;

  prospectRows.innerHTML = state.prospects.map(p => `
    <tr>
      <td>${esc(p.business)}</td>
      <td>${esc(p.city)}</td>
      <td>${esc(p.status)}</td>
      <td>${esc(p.email)}</td>
      <td>
        <button onclick="makeDraft(${p.id})">Draft</button>
        <button onclick="queue(${p.id})">Queue</button>
        <button class="secondary" onclick="setStatus(${p.id},'Contacted')">Contacted</button>
        <button class="secondary" onclick="setStatus(${p.id},'Interested')">Interested</button>
        <button class="secondary" onclick="makeClient(${p.id})">Client</button>
      </td>
    </tr>
  `).join('');

  taskRows.innerHTML = state.tasks.slice().reverse().map(t => {
    const p = state.prospects.find(x => x.id === t.prospectId);
    return `<tr><td>${esc(p?.business || 'Unknown')}</td><td>${esc(t.task)}</td><td>${esc(t.status)}</td></tr>`;
  }).join('');

  approvalRows.innerHTML = state.approvals.map(a => {
    const p = state.prospects.find(x => x.id === a.prospectId);
    let actions;

    if (a.status === 'Pending') {
      actions = `<button onclick="loadApproval(${a.id})">Load</button>
        <button onclick="approve(${a.id})">Approve & Send</button>
        <button class="secondary" onclick="reject(${a.id})">Reject</button>`;
    } else if (a.status === 'Sending') {
      actions = '<span>Sending…</span>';
    } else {
      actions = `<span>${esc(a.status)}</span>`;
    }

    return `<tr>
      <td>${esc(p?.business || 'Unknown')}</td>
      <td>${esc(a.action)}</td>
      <td>${esc(a.status)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  clientRows.innerHTML = state.clients.map(c => `
    <tr>
      <td>${esc(c.business)}</td>
      <td>${esc(c.status)}</td>
      <td>$${c.revenue.toFixed(2)} <button onclick="addRevenue(${c.prospectId})">+ Revenue</button></td>
    </tr>
  `).join('');

  document.getElementById('log').textContent = state.activity.join('\n');
}

window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer);
});

render();
