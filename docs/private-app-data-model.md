# TableSide Growth — Private App Data Model

Status: implementation blueprint for migration away from the public GitHub Pages/localStorage prototype.

## Non-negotiable authorization boundary

AI may discover public business information, research, analyze, organize, suggest next actions, and prepare drafts.

AI may NOT send or publish communications, spend/charge/transfer money, accept agreements, delete important data, change critical account settings, or perform another consequential external action without explicit human authorization.

Outbound authorization must be server-enforced and bound to the exact action payload. For email that means the exact account/user, recipient, subject, and body. Editing any bound field invalidates the authorization. Authorizations are single-use and short-lived. There is no scheduled-send, fallback-send, or agent bypass path.

## Core records

### users
- id
- email
- display_name
- role
- created_at
- last_login_at

Initial deployment is single-owner/private. The schema still uses a user id so access control is explicit.

### prospects
- id
- owner_user_id
- business_name
- city
- website
- instagram
- public_email
- notes
- status: discovered | new | researching | draft_ready | contacted | replied | interested | client | closed
- next_action
- next_action_at
- created_at
- updated_at

### prospect_sources
- id
- prospect_id
- source_url
- source_title
- source_type: official_site | official_social | directory | news | other
- verified_at
- created_at

### research_runs
- id
- prospect_id
- status: queued | running | complete | failed
- identity_confidence: low | medium | high
- matched_business
- summary
- created_at
- completed_at

### research_facts
- id
- research_run_id
- fact
- confidence: low | medium | high
- created_at

Facts link to sources through research_fact_sources(research_fact_id, prospect_source_id). Suggestions must never be stored as verified facts.

### opportunities
- id
- prospect_id
- research_run_id
- idea
- evidence_summary
- confidence: low | medium | high
- status: suggested | accepted | rejected
- created_at

### outreach_drafts
- id
- prospect_id
- research_run_id
- channel: email
- recipient
- subject
- body
- version
- status: draft | pending_review | authorized | sent | rejected
- created_at
- updated_at

Every edit creates/increments a version and invalidates any authorization for an older version.

### action_authorizations
- id
- owner_user_id
- action_type: send_email
- target_record_id
- payload_hash
- status: pending | authorized | consumed | expired | cancelled
- expires_at
- authorized_at
- consumed_at
- created_at

The backend computes payload_hash. The client cannot choose or override it. Execution checks the authenticated owner, action type, exact current payload hash, expiry, and unused status in one transaction before consuming the authorization.

### communications
- id
- prospect_id
- outreach_draft_id
- direction: outbound | inbound
- channel: email
- provider_message_id
- subject
- body_snapshot
- sent_or_received_at
- created_at

Inbound records are informational. A reply never authorizes an outbound response.

### tasks
- id
- prospect_id
- task_type: research | prepare_draft | review_reply | follow_up | client_delivery | other
- title
- status: queued | working | awaiting_human | complete | cancelled | failed
- due_at
- created_at
- updated_at

### clients
- id
- prospect_id
- owner_user_id
- status: active | paused | completed
- started_at
- created_at

### revenue_entries
- id
- client_id
- owner_user_id
- amount_cents
- currency
- description
- occurred_at
- created_at

Revenue entries are bookkeeping records only. TableSide Growth does not move money.

### activity_events
- id
- owner_user_id
- prospect_id nullable
- event_type
- summary
- metadata_json
- created_at

Keep an append-oriented audit trail for important state changes, authorization creation/consumption, outbound sends, and emergency stops. Never put API secrets in activity metadata.

## Server-side permission rules

1. Every private API route requires authentication except health/login callback routes.
2. Every record query is scoped to the authenticated owner.
3. Browser code never receives OpenAI, Gmail client-secret, database-admin, or other server credentials.
4. AI endpoints can only create/update preparation records; they cannot call the outbound execution function.
5. Email execution is a separate backend path requiring a valid single-use action_authorization for the exact current draft payload.
6. Emergency Stop prevents new agent/preparation jobs from starting. It does not silently approve, send, or discard anything.
7. Financial records are informational; no payment/transfer execution endpoint exists.
8. Important deletes should be soft-delete/archive first and require explicit human action.

## Migration from preview localStorage

The preview remains disposable test data. Before real use, create authenticated private storage and migrate only records the owner deliberately chooses to import. Do not automatically upload the browser's existing test prospects.

Migration order:
1. Authentication/session layer.
2. Database + owner-scoped prospects/tasks/clients/activity.
3. Research sources/facts/opportunities.
4. Draft versions + server-side authorization records.
5. Gmail send execution behind authorization transaction.
6. Communications/reply tracking.
7. Remove private control-center functionality from the public GitHub Pages site and replace it with the public marketing site.

## Discovery adapter

Discovery is intentionally provider-independent:

`discover({ city, category, limit }) -> candidate[]`

A candidate contains business_name, city, website, public_email if explicitly public, provider identity, and evidence/source references. The current AI web-search experiment can be disabled without changing the rest of the pipeline. A structured places provider can be added later when revenue justifies it.
