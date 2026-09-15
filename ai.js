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
  return data;
}

const localMakeDraft = window.makeDraft;
window.makeDraft = async function(id) {
  if (typeof localMakeDraft === 'function') localMakeDraft(id);

  const key = 'tableside_growth_pwa_v1';
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  const prospect = saved?.prospects?.find(p => p.id === id);
  if (!prospect) return alert('Prospect not found.');

  const box = document.getElementById('workingDraft');
  if (!box) return;
  const fallback = box.value;
  box.disabled = true;
  box.value = 'Generating personalized AI draft…';

  try {
    const draft = await requestAIDraft(prospect);
    box.value = draft.body;
    box.dataset.aiSubject = draft.subject;
  } catch (error) {
    box.value = fallback;
    console.error('AI draft generation failed:', error);
    alert(`AI draft unavailable: ${error.message}\n\nThe local fallback draft has been kept.`);
  } finally {
    box.disabled = false;
  }
};
