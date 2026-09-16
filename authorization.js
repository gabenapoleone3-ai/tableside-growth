// TableSide Growth authorization boundary.
// Consequential external actions must originate from a fresh, explicit user approval.

window.approve = async function(id) {
  const a = state.approvals.find(x => x.id === id);
  if (!a) return;
  normalizeApproval(a);

  if (a.status !== 'Pending') return alert(`This approval is already ${a.status}.`);

  const p = state.prospects.find(x => x.id === a.prospectId);
  if (!p) return alert('Prospect not found.');
  if (!p.email) return alert('This prospect does not have an email address.');
  if (!window.gmailIsConnected || !window.gmailIsConnected()) return alert('Connect Gmail first.');

  const body = String(a.body || '').trim();
  const subject = String(a.subject || '').trim();
  if (!body || !subject) return alert('This approval is missing a subject or email draft.');

  const confirmed = confirm(
    `FINAL AUTHORIZATION REQUIRED\n\nThis will send exactly one email.\n\nTo: ${p.email}\nSubject: ${subject}\n\nNothing will be sent unless you press OK.`
  );
  if (!confirmed) {
    state.activity.unshift(`${new Date().toLocaleString()} — Send cancelled by user for ${p.business}`);
    save();
    return;
  }

  if (!window.authorizeSingleEmail) return alert('Send blocked: authorization system is unavailable.');
  const authorizationToken = window.authorizeSingleEmail(p.email, subject, body);
  if (!authorizationToken) return alert('Send blocked: authorization could not be created.');

  a.status = 'Sending';
  save();
  const sent = await sendApprovedEmail(p.email, subject, body, authorizationToken);

  if (!sent) {
    a.status = 'Pending';
    save();
    return;
  }

  a.status = 'Sent';
  p.status = 'Contacted';
  log(`Explicitly authorized and sent outreach to ${p.business}`);
};
