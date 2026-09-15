const TABLESIDE_AI_URL = 'https://tableside-ai-backend-production.up.railway.app';

async function requestAIDraft(prospect) {
  const response = await fetch(`${TABLESIDE_AI_URL}/api/generate-draft`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      businessName: prospect.business,
      city: prospect.city,
      website: prospect.website,
      instagram: prospect.instagram,
      notes: prospect.notes
    })
  });

  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || `AI request failed (${response.status})`);
  if (!data.body || !data.subject) throw new Error('AI returned an incomplete draft.');
  return {subject:String(data.subject).trim(), body:String(data.body).trim()};
}

function getAppState() {
  return JSON.parse(localStorage.getItem('tableside_growth_pwa_v1') || 'null');
}

function putAppState(next) {
  localStorage.setItem('tableside_growth_pwa_v1', JSON.stringify(next));
}

async function generateAIApproval(id) {
  const saved = getAppState();
  const prospect = saved?.prospects?.find(p => p.id === id);
  if (!prospect) return alert('Prospect not found.');

  const existing = saved.approvals?.find(a => a.prospectId === id && ['Pending','Sending'].includes(a.status));
  if (existing) return alert('This prospect already has an approval waiting. Review or reject it before generating another.');

  const box = document.getElementById('workingDraft');
  if (box) {
    box.disabled = true;
    box.value = 'Generating personalized AI draft…';
  }

  try {
    const draft = await requestAIDraft(prospect);
    const latest = getAppState();
    if (!latest) throw new Error('App state unavailable.');
    latest.approvals ||= [];
    latest.activity ||= [];
    latest.approvals.unshift({
      id: Date.now(),
      prospectId: id,
      action: 'AI-drafted outbound outreach',
      status: 'Pending',
      subject: draft.subject,
      body: draft.body,
      package: `TABLESIDE GROWTH — AI OUTREACH DRAFT\n\nBusiness: ${prospect.business}\n\nSUBJECT\n${draft.subject}\n\nCUSTOMER-FACING DRAFT\n${draft.body}\n\nAUTHORIZATION\nNot sent. Explicit human approval is required before any communication leaves TableSide Growth.`
    });
    latest.selected = id;
    latest.selectedApproval = latest.approvals[0].id;
    latest.activity.unshift(`${new Date().toLocaleString()} — AI prepared draft for ${prospect.business} — NOT SENT — awaiting explicit approval`);
    putAppState(latest);
    if (box) box.value = draft.body;
    if (typeof render === 'function') render();
    if (typeof showTab === 'function') showTab('approvals');
  } catch (error) {
    console.error('AI draft generation failed:', error);
    if (box) box.value = '';
    alert(`AI draft unavailable: ${error.message}\n\nNothing was sent.`);
  } finally {
    if (box) box.disabled = false;
  }
}

// Drafting is preparation only. This module deliberately has no Gmail send,
// payment, publishing, or external-communication capability.
window.generateAIApproval = generateAIApproval;

const localMakeDraft = window.makeDraft;
window.makeDraft = function(id) {
  if (typeof localMakeDraft === 'function') localMakeDraft(id);
  return generateAIApproval(id);
};
