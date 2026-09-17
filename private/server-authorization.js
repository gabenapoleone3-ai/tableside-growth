// Adds a second, server-enforced authorization gate around the existing Gmail exact-message gate.
// AI may prepare content, but only the signed-in owner can create and consume an authorization.
(() => {
  let serverReviewed = null;

  function clearServerReview(message = 'Changes require a new review.') {
    serverReviewed = null;
    reviewed = null;
    $('sendBtn').classList.add('hidden');
    $('reviewBtn').classList.remove('hidden');
    $('sendStatus').textContent = message;
  }

  ['draftTo','draftSubject','draftBody'].forEach(id => {
    $(id).addEventListener('input', () => {
      if (serverReviewed) clearServerReview();
    });
  });

  $('reviewBtn').onclick = async () => {
    const m = exact();
    if (!active?.id) return alert('Select a prospect before reviewing a message.');
    if (!m.to || !m.subject || !m.body) return alert('Recipient, subject and body are required.');

    $('reviewBtn').disabled = true;
    $('sendStatus').textContent = 'Saving this exact message for server-side review…';
    try {
      const { draft } = await request(`/api/private/prospects/${active.id}/drafts`, {
        method: 'POST',
        body: JSON.stringify({ recipient: m.to, subject: m.subject, body: m.body })
      });
      serverReviewed = { ...m, draftId: draft.id };
      reviewed = { ...m };
      $('reviewBtn').classList.add('hidden');
      $('sendBtn').classList.remove('hidden');
      $('sendStatus').textContent = 'Exact message saved and reviewed. Editing anything cancels this review. The next step requires separate authorization.';
    } catch (err) {
      clearServerReview(`Review failed: ${err.message}. Nothing was sent.`);
    } finally {
      $('reviewBtn').disabled = false;
    }
  };

  $('sendBtn').onclick = async () => {
    if (!serverReviewed || !reviewed) return clearServerReview('Review the exact message again before sending.');
    const m = exact();
    if (m.to !== serverReviewed.to || m.subject !== serverReviewed.subject || m.body !== serverReviewed.body) {
      clearServerReview();
      return alert('Message changed. Review it again before sending.');
    }
    if (!confirm(`FINAL AUTHORIZATION\n\nSend this exact email to ${m.to}?\n\nCancel means nothing is sent.`)) return;

    $('sendBtn').disabled = true;
    $('sendStatus').textContent = 'Creating server-side authorization…';
    try {
      const { authorization } = await request(`/api/private/drafts/${serverReviewed.draftId}/authorize`, {
        method: 'POST',
        body: JSON.stringify({ recipient: m.to, subject: m.subject, body: m.body })
      });
      const { authorizedMessage } = await request(`/api/private/authorizations/${authorization.id}/consume`, {
        method: 'POST',
        body: JSON.stringify({ recipient: m.to, subject: m.subject, body: m.body })
      });
      if (authorizedMessage.recipient !== m.to || authorizedMessage.subject !== m.subject || authorizedMessage.body !== m.body) {
        throw new Error('Server authorization payload mismatch');
      }

      // Existing browser Gmail gate remains mandatory as an additional independent check.
      const gmailAuthorization = window.authorizeSingleEmail?.(m.to, m.subject, m.body);
      if (!gmailAuthorization) throw new Error('Gmail authorization could not be created');
      $('sendStatus').textContent = 'Server authorization consumed. Sending the exact authorized message through Gmail…';
      const sent = await window.sendApprovedEmail(m.to, m.subject, m.body, gmailAuthorization);
      if (!sent) throw new Error('Gmail did not send the message');

      $('sendStatus').textContent = 'Sent after server and Gmail authorization.';
      if (active) {
        await request(`/api/private/prospects/${active.id}/communications/outbound`, {
          method: 'POST',
          body: JSON.stringify({ subject: m.subject, body: m.body, at: new Date().toISOString() })
        });
        await request(`/api/private/prospects/${active.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'contacted', nextAction: 'Wait for reply / schedule follow-up' })
        });
        await loadProspects();
        if (timelineProspect?.id === active.id) await refreshTimeline();
      }
      serverReviewed = null;
      reviewed = null;
      $('sendBtn').classList.add('hidden');
      $('reviewBtn').classList.remove('hidden');
    } catch (err) {
      // A consumed authorization is intentionally never reusable. Any failure requires a fresh human review.
      clearServerReview(`Not sent or send not confirmed: ${err.message}. Review and authorize again before any retry.`);
    } finally {
      $('sendBtn').disabled = false;
    }
  };
})();
