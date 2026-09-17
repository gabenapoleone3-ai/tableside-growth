BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  business_name text NOT NULL,
  city text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  instagram text NOT NULL DEFAULT '',
  public_email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('discovered','new','researching','draft_ready','contacted','replied','interested','client','closed')),
  next_action text NOT NULL DEFAULT '',
  next_action_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospects_owner_status_idx ON prospects(owner_user_id,status) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS prospect_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'other' CHECK (source_type IN ('official_site','official_social','directory','news','other')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prospect_id,source_url)
);

CREATE TABLE IF NOT EXISTS research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed')),
  identity_confidence text NOT NULL DEFAULT 'low' CHECK (identity_confidence IN ('low','medium','high')),
  matched_business text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS research_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  fact text NOT NULL,
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_fact_sources (
  research_fact_id uuid NOT NULL REFERENCES research_facts(id) ON DELETE CASCADE,
  prospect_source_id uuid NOT NULL REFERENCES prospect_sources(id) ON DELETE CASCADE,
  PRIMARY KEY(research_fact_id,prospect_source_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES research_runs(id) ON DELETE SET NULL,
  idea text NOT NULL,
  evidence_summary text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES research_runs(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  recipient text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','authorized','sent','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (action_type IN ('send_email')),
  target_record_id uuid NOT NULL REFERENCES outreach_drafts(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','consumed','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authorizations_active_idx ON action_authorizations(owner_user_id,target_record_id,status,expires_at);

CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  outreach_draft_id uuid REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  provider_message_id text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_snapshot text NOT NULL DEFAULT '',
  sent_or_received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  task_type text NOT NULL DEFAULT 'other' CHECK (task_type IN ('research','prepare_draft','review_reply','follow_up','client_delivery','other')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','working','awaiting_human','complete','cancelled','failed')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'CAD',
  description text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id bigserial PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_owner_created_idx ON activity_events(owner_user_id,created_at DESC);

COMMIT;
