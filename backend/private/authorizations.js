import crypto from 'node:crypto';
import { pool, query } from '../db/pool.js';
import { sendAuthorizedGmail } from './gmail-send.js';

const clean=(v,max=12000)=>String(v??'').trim().slice(0,max);
const hashPayload=({recipient,subject,body})=>crypto.createHash('sha256').update(JSON.stringify({recipient:clean(recipient,320).toLowerCase(),subject:clean(subject,500),body:clean(body,12000)})).digest('hex');

async function ownsProspect(ownerUserId,prospectId){const r=await query('SELECT id FROM prospects WHERE id=$1 AND owner_user_id=$2 AND archived_at IS NULL',[prospectId,ownerUserId]);return Boolean(r.rowCount);}

export async function createDraft(ownerUserId,prospectId,input={}){
  if(!await ownsProspect(ownerUserId,prospectId))return null;
  const recipient=clean(input.recipient,320),subject=clean(input.subject,500),body=clean(input.body,12000);
  if(!recipient||!subject||!body)throw new Error('Recipient, subject and body are required');
  const r=await query(`INSERT INTO outreach_drafts(prospect_id,recipient,subject,body,status) VALUES($1,$2,$3,$4,'pending_review') RETURNING id,prospect_id AS "prospectId",recipient,subject,body,version,status,created_at AS "createdAt"`,[prospectId,recipient,subject,body]);
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'draft_review_checkpoint','Exact email saved for human review')`,[ownerUserId,prospectId]);
  return r.rows[0];
}

export async function authorizeDraft(ownerUserId,draftId,input={}){
  const r=await query(`SELECT d.*,p.owner_user_id FROM outreach_drafts d JOIN prospects p ON p.id=d.prospect_id WHERE d.id=$1 AND p.owner_user_id=$2 AND p.archived_at IS NULL LIMIT 1`,[draftId,ownerUserId]);
  if(!r.rowCount)return null;const d=r.rows[0];
  const payload={recipient:clean(input.recipient,320),subject:clean(input.subject,500),body:clean(input.body,12000)};
  if(hashPayload(payload)!==hashPayload({recipient:d.recipient,subject:d.subject,body:d.body}))throw new Error('Draft changed after review. Review the exact message again.');
  await query(`UPDATE action_authorizations SET status='cancelled' WHERE owner_user_id=$1 AND target_record_id=$2 AND status IN ('pending','authorized')`,[ownerUserId,draftId]);
  const expiresAt=new Date(Date.now()+60_000);
  const a=await query(`INSERT INTO action_authorizations(owner_user_id,action_type,target_record_id,payload_hash,status,expires_at,authorized_at) VALUES($1,'send_email',$2,$3,'authorized',$4,now()) RETURNING id,status,expires_at AS "expiresAt"`,[ownerUserId,draftId,hashPayload(payload),expiresAt]);
  await query(`UPDATE outreach_drafts SET status='authorized',updated_at=now() WHERE id=$1`,[draftId]);
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'email_authorized','Human explicitly authorized exact email payload')`,[ownerUserId,d.prospect_id]);
  return {...a.rows[0],draftId};
}

export async function consumeAuthorization(ownerUserId,authorizationId,input={}){
  if(!pool)throw new Error('Database is not configured');
  const payload={recipient:clean(input.recipient,320),subject:clean(input.subject,500),body:clean(input.body,12000)};
  const accessToken=clean(input.gmailAccessToken,6000);
  if(!accessToken)throw new Error('Gmail connection is required');

  // Claim the authorization atomically inside one real PostgreSQL transaction.
  // The row lock is held until COMMIT, so simultaneous send attempts cannot both win.
  const client=await pool.connect();
  let a;
  try{
    await client.query('BEGIN');
    const r=await client.query(`SELECT a.*,d.prospect_id,d.recipient,d.subject,d.body
      FROM action_authorizations a
      JOIN outreach_drafts d ON d.id=a.target_record_id
      JOIN prospects p ON p.id=d.prospect_id
      WHERE a.id=$1 AND a.owner_user_id=$2 AND p.owner_user_id=$2
      FOR UPDATE`,[authorizationId,ownerUserId]);
    if(!r.rowCount){await client.query('ROLLBACK');return null;}
    a=r.rows[0];
    if(a.status!=='authorized')throw new Error('Authorization is not active');
    if(new Date(a.expires_at)<=new Date()){
      await client.query(`UPDATE action_authorizations SET status='expired' WHERE id=$1`,[authorizationId]);
      await client.query(`UPDATE outreach_drafts SET status='pending_review',updated_at=now() WHERE id=$1`,[a.target_record_id]);
      await client.query('COMMIT');
      throw new Error('Authorization expired. Review and authorize again.');
    }
    if(hashPayload(payload)!==a.payload_hash||hashPayload(payload)!==hashPayload({recipient:a.recipient,subject:a.subject,body:a.body}))throw new Error('Exact message does not match authorization');
    const used=await client.query(`UPDATE action_authorizations SET status='consumed',consumed_at=now() WHERE id=$1 AND status='authorized' RETURNING id`,[authorizationId]);
    if(!used.rowCount)throw new Error('Authorization was already consumed');
    await client.query('COMMIT');
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{client.release();}

  // External Gmail call happens only after the single-use authorization claim commits.
  // A failed Gmail call never reactivates that authorization.
  let sent;
  try{
    sent=await sendAuthorizedGmail({accessToken,recipient:a.recipient,subject:a.subject,body:a.body});
  }catch(error){
    await query(`UPDATE outreach_drafts SET status='pending_review',updated_at=now() WHERE id=$1`,[a.target_record_id]);
    await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'email_send_failed','Authorized Gmail send failed; fresh authorization required')`,[ownerUserId,a.prospect_id]);
    throw error;
  }

  await query(`UPDATE outreach_drafts SET status='sent',updated_at=now() WHERE id=$1`,[a.target_record_id]);
  await query(`INSERT INTO communications(prospect_id,outreach_draft_id,direction,channel,provider_message_id,subject,body_snapshot,sent_or_received_at) VALUES($1,$2,'outbound','email',$3,$4,$5,now())`,[a.prospect_id,a.target_record_id,clean(sent.providerMessageId,500),a.subject,a.body]);
  await query(`UPDATE prospects SET status='contacted',next_action='Wait for reply / schedule follow-up',updated_at=now() WHERE id=$1 AND owner_user_id=$2`,[a.prospect_id,ownerUserId]);
  await query(`INSERT INTO activity_events(owner_user_id,prospect_id,event_type,summary) VALUES($1,$2,'email_sent','Authorized email sent by backend through Gmail')`,[ownerUserId,a.prospect_id]);
  return {sent:true,draftId:a.target_record_id,prospectId:a.prospect_id,providerMessageId:sent.providerMessageId,threadId:sent.threadId};
}
