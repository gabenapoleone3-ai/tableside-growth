import { query } from '../db/pool.js';

const STATUSES = new Set(['discovered','new','researching','draft_ready','contacted','replied','interested','client','closed']);
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function rowToProspect(row) {
  return {
    id: row.id,
    businessName: row.business_name,
    city: row.city,
    website: row.website,
    instagram: row.instagram,
    publicEmail: row.public_email,
    notes: row.notes,
    status: row.status,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function ensureOwner(email, displayName = '') {
  const normalized = clean(email, 320).toLowerCase();
  if (!normalized) throw new Error('Authenticated owner email is required');
  const result = await query(
    `INSERT INTO users (email, display_name, last_login_at)
     VALUES ($1,$2,now())
     ON CONFLICT (email) DO UPDATE SET last_login_at=now(), display_name=COALESCE(NULLIF(EXCLUDED.display_name,''),users.display_name)
     RETURNING id,email,display_name,role`,
    [normalized, clean(displayName, 160)]
  );
  return result.rows[0];
}

export async function listProspects(ownerUserId) {
  const result = await query(
    `SELECT * FROM prospects WHERE owner_user_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC, created_at DESC LIMIT 500`,
    [ownerUserId]
  );
  return result.rows.map(rowToProspect);
}

export async function getProspect(ownerUserId, id) {
  const result = await query(`SELECT * FROM prospects WHERE id=$1 AND owner_user_id=$2 AND archived_at IS NULL LIMIT 1`,[id,ownerUserId]);
  return result.rowCount ? rowToProspect(result.rows[0]) : null;
}

export async function createProspect(ownerUserId, input = {}) {
  const businessName = clean(input.businessName, 160);
  if (!businessName) throw new Error('Business name is required');
  const status = STATUSES.has(input.status) ? input.status : 'new';
  const result = await query(
    `INSERT INTO prospects
      (owner_user_id,business_name,city,website,instagram,public_email,notes,status,next_action,next_action_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [ownerUserId,businessName,clean(input.city,120),clean(input.website,500),clean(input.instagram,250),clean(input.publicEmail,250),clean(input.notes,4000),status,clean(input.nextAction,500),input.nextActionAt || null]
  );
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'prospect_created',$3)`,[ownerUserId,result.rows[0].id,`Created prospect: ${businessName}`]);
  return rowToProspect(result.rows[0]);
}

export async function updateProspect(ownerUserId, id, input = {}) {
  const existing = await query(`SELECT * FROM prospects WHERE id=$1 AND owner_user_id=$2 AND archived_at IS NULL`,[id,ownerUserId]);
  if (!existing.rowCount) return null;
  const current = existing.rows[0];
  const businessName = input.businessName === undefined ? current.business_name : clean(input.businessName,160);
  if (!businessName) throw new Error('Business name is required');
  const proposedStatus = input.status === undefined ? current.status : input.status;
  if (!STATUSES.has(proposedStatus)) throw new Error('Invalid prospect status');
  const values = [
    businessName,
    input.city === undefined ? current.city : clean(input.city,120),
    input.website === undefined ? current.website : clean(input.website,500),
    input.instagram === undefined ? current.instagram : clean(input.instagram,250),
    input.publicEmail === undefined ? current.public_email : clean(input.publicEmail,250),
    input.notes === undefined ? current.notes : clean(input.notes,4000),
    proposedStatus,
    input.nextAction === undefined ? current.next_action : clean(input.nextAction,500),
    input.nextActionAt === undefined ? current.next_action_at : (input.nextActionAt || null),
    id,ownerUserId
  ];
  const result = await query(
    `UPDATE prospects SET business_name=$1,city=$2,website=$3,instagram=$4,public_email=$5,notes=$6,status=$7,next_action=$8,next_action_at=$9,updated_at=now()
     WHERE id=$10 AND owner_user_id=$11 AND archived_at IS NULL RETURNING *`,values
  );
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'prospect_updated',$3)`,[ownerUserId,id,`Updated prospect: ${businessName}`]);
  return rowToProspect(result.rows[0]);
}

export async function archiveProspect(ownerUserId, id) {
  const result = await query(`UPDATE prospects SET archived_at=now(),updated_at=now() WHERE id=$1 AND owner_user_id=$2 AND archived_at IS NULL RETURNING id,business_name`,[id,ownerUserId]);
  if (!result.rowCount) return false;
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'prospect_archived',$3)`,[ownerUserId,id,`Archived prospect: ${result.rows[0].business_name}`]);
  return true;
}
