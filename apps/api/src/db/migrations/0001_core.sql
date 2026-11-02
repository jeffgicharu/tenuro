-- Core schema. Every business table carries tenant_id and sandbox_id.
-- sandbox_id IS NULL marks the shared base data; a non-null value marks a visitor's private overlay row.
-- Aggregate roots that visitors can edit (lease, key_date, task, saved_view) also carry origin_id:
-- an overlay copy points at the base row it replaces, and its logical id is the base row's id.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

CREATE FUNCTION app.tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('tenuro.tenant', true), '')::uuid $$;

CREATE FUNCTION app.sandbox() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('tenuro.sandbox', true), '')::uuid $$;

CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');
CREATE TYPE property_type AS ENUM ('OFFICE', 'RETAIL', 'WAREHOUSE', 'INDUSTRIAL', 'MIXED_USE');
CREATE TYPE lease_status AS ENUM ('DRAFT', 'ACTIVE', 'HOLDING_OVER', 'EXPIRED', 'TERMINATED');
CREATE TYPE payment_frequency AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE payment_timing AS ENUM ('ADVANCE', 'ARREARS');
CREATE TYPE accounting_standard AS ENUM ('IFRS16', 'ASC842');
CREATE TYPE asc842_class AS ENUM ('FINANCE', 'OPERATING');
CREATE TYPE lease_exemption AS ENUM ('NONE', 'SHORT_TERM', 'LOW_VALUE');
CREATE TYPE party_role AS ENUM ('LANDLORD', 'LESSEE_ENTITY', 'GUARANTOR', 'AGENT');
CREATE TYPE escalation_kind AS ENUM ('FIXED', 'CPI', 'MARKET_REVIEW');
CREATE TYPE option_kind AS ENUM ('BREAK', 'RENEWAL', 'PURCHASE');
CREATE TYPE option_status AS ENUM ('OPEN', 'EXERCISED', 'WAIVED', 'LAPSED');
CREATE TYPE deposit_kind AS ENUM ('CASH', 'BANK_GUARANTEE', 'LETTER_OF_CREDIT');
CREATE TYPE deposit_status AS ENUM ('HELD', 'PARTLY_RETURNED', 'RETURNED');
CREATE TYPE key_date_kind AS ENUM ('BREAK_NOTICE', 'RENEWAL_NOTICE', 'RENT_REVIEW', 'EXPIRY', 'DEPOSIT_RETURN', 'INSURANCE', 'CUSTOM');
CREATE TYPE key_date_status AS ENUM ('UPCOMING', 'ACTIONED', 'DISMISSED');
CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE task_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE document_kind AS ENUM ('LEASE', 'AMENDMENT', 'FLOOR_PLAN', 'PHOTO', 'CERTIFICATE', 'CORRESPONDENCE', 'OTHER');
CREATE TYPE view_scope AS ENUM ('LEASE_REGISTER', 'KEY_DATES', 'TASKS');
CREATE TYPE modification_kind AS ENUM ('INDEX_CHANGE', 'TERM_REASSESSMENT', 'SEPARATE_LEASE', 'SCOPE_DECREASE', 'OTHER');

-- Tenancy and access -------------------------------------------------------

CREATE TABLE tenant (
  id                 uuid PRIMARY KEY,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  name_local         text,
  locale             text NOT NULL,
  languages          text[] NOT NULL,
  reporting_currency char(3) NOT NULL,
  theme              jsonb NOT NULL,
  sort_order         int NOT NULL DEFAULT 0
);

CREATE TABLE app_user (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  email         text NOT NULL,
  display_name  text NOT NULL,
  job_title     text NOT NULL,
  role          user_role NOT NULL,
  locale        text,
  is_listed     boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, email)
);
CREATE INDEX ON app_user (tenant_id);

CREATE TABLE sandbox (
  id              uuid PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  ip_hash         text NOT NULL,
  write_count     int NOT NULL DEFAULT 0,
  upload_bytes    bigint NOT NULL DEFAULT 0
);
CREATE INDEX ON sandbox (last_active_at);
CREATE INDEX ON sandbox (ip_hash, created_at);

CREATE TABLE session (
  token_hash    text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  ip_hash       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX ON session (expires_at);
CREATE INDEX ON session (ip_hash, created_at);

-- Portfolio ----------------------------------------------------------------

CREATE TABLE property (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  type          property_type NOT NULL,
  address_line  text NOT NULL,
  city          text NOT NULL,
  region        text,
  country_code  char(2) NOT NULL,
  area_sqm      numeric(12, 2) NOT NULL,
  year_built    int,
  latitude      numeric(9, 6),
  longitude     numeric(9, 6),
  photo         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON property (tenant_id, country_code);
CREATE INDEX property_name_trgm ON property USING gin (name gin_trgm_ops);

CREATE TABLE lease (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL REFERENCES tenant(id),
  sandbox_id               uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  origin_id                uuid REFERENCES lease(id) ON DELETE CASCADE,
  deleted_at               timestamptz,
  version                  int NOT NULL DEFAULT 1,
  reference                text NOT NULL,
  status                   lease_status NOT NULL,
  property_id              uuid NOT NULL REFERENCES property(id),
  premises                 text NOT NULL,
  area_sqm                 numeric(12, 2) NOT NULL,
  commencement_date        date NOT NULL,
  expiry_date              date NOT NULL,
  currency                 char(3) NOT NULL,
  payment_frequency        payment_frequency NOT NULL,
  payment_timing           payment_timing NOT NULL,
  rent_per_period          numeric(18, 4) NOT NULL,
  service_charge_per_period numeric(18, 4) NOT NULL DEFAULT 0,
  discount_rate            numeric(9, 6) NOT NULL,
  initial_direct_costs     numeric(18, 4) NOT NULL DEFAULT 0,
  incentives               numeric(18, 4) NOT NULL DEFAULT 0,
  prepayments              numeric(18, 4) NOT NULL DEFAULT 0,
  restoration_cost         numeric(18, 4) NOT NULL DEFAULT 0,
  useful_life_months       int,
  ownership_transfers      boolean NOT NULL DEFAULT false,
  standard                 accounting_standard NOT NULL DEFAULT 'IFRS16',
  asc842_class             asc842_class,
  exemption                lease_exemption NOT NULL DEFAULT 'NONE',
  cost_centre              text,
  notes                    text,
  -- Denormalised for server-side sorting and filtering of the register; kept current on every write.
  country_code             char(2) NOT NULL,
  city                     text NOT NULL,
  property_type            property_type NOT NULL,
  property_name            text NOT NULL,
  landlord_name            text NOT NULL,
  lessee_entity            text NOT NULL,
  annual_rent              numeric(18, 4) NOT NULL,
  annual_rent_reporting    numeric(18, 2) NOT NULL,
  next_key_date            date,
  next_key_kind            key_date_kind,
  created_by               uuid REFERENCES app_user(id),
  updated_by               uuid REFERENCES app_user(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_date > commencement_date),
  CHECK (origin_id IS NULL OR sandbox_id IS NOT NULL)
);
CREATE INDEX ON lease (tenant_id, status) WHERE sandbox_id IS NULL;
CREATE INDEX ON lease (tenant_id, expiry_date) WHERE sandbox_id IS NULL;
CREATE INDEX ON lease (tenant_id, annual_rent_reporting) WHERE sandbox_id IS NULL;
CREATE INDEX ON lease (tenant_id, next_key_date) WHERE sandbox_id IS NULL;
CREATE INDEX ON lease (tenant_id, country_code, city) WHERE sandbox_id IS NULL;
CREATE INDEX lease_property_name_trgm ON lease USING gin (property_name gin_trgm_ops);
CREATE INDEX lease_landlord_trgm ON lease USING gin (landlord_name gin_trgm_ops);
CREATE INDEX ON lease (property_id);
CREATE UNIQUE INDEX lease_overlay_origin ON lease (sandbox_id, origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX ON lease (sandbox_id) WHERE sandbox_id IS NOT NULL;
CREATE INDEX lease_reference_trgm ON lease USING gin (reference gin_trgm_ops);

-- Lease children belong to one lease *row* (a version), so an overlay copy of a lease carries its own copies.
CREATE TABLE lease_party (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_row_id  uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  role          party_role NOT NULL,
  name          text NOT NULL,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  position      int NOT NULL DEFAULT 0
);
CREATE INDEX ON lease_party (lease_row_id);
CREATE INDEX lease_party_name_trgm ON lease_party USING gin (name gin_trgm_ops);

CREATE TABLE rent_step (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  sandbox_id        uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_row_id      uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  starts_on         date NOT NULL,
  rent_per_period   numeric(18, 4) NOT NULL
);
CREATE INDEX ON rent_step (lease_row_id, starts_on);

CREATE TABLE escalation (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  sandbox_id        uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_row_id      uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  kind              escalation_kind NOT NULL,
  rate              numeric(9, 6),
  index_name        text,
  cap               numeric(9, 6),
  collar            numeric(9, 6),
  every_months      int NOT NULL,
  first_review_on   date NOT NULL
);
CREATE INDEX ON escalation (lease_row_id);

CREATE TABLE lease_option (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  sandbox_id          uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_row_id        uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  kind                option_kind NOT NULL,
  exercise_on         date NOT NULL,
  notice_by           date,
  term_months         int,
  price               numeric(18, 4),
  reasonably_certain  boolean NOT NULL DEFAULT false,
  status              option_status NOT NULL DEFAULT 'OPEN',
  terms               text
);
CREATE INDEX ON lease_option (lease_row_id);

CREATE TABLE deposit (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  sandbox_id      uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_row_id    uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  kind            deposit_kind NOT NULL,
  amount          numeric(18, 4) NOT NULL,
  currency        char(3) NOT NULL,
  held_by         text NOT NULL,
  return_due_on   date,
  status          deposit_status NOT NULL DEFAULT 'HELD'
);
CREATE INDEX ON deposit (lease_row_id);

-- Workflow -----------------------------------------------------------------

CREATE TABLE key_date (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  origin_id     uuid REFERENCES key_date(id) ON DELETE CASCADE,
  deleted_at    timestamptz,
  version       int NOT NULL DEFAULT 1,
  lease_id      uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  kind          key_date_kind NOT NULL,
  due_on        date NOT NULL,
  title         text NOT NULL,
  status        key_date_status NOT NULL DEFAULT 'UPCOMING',
  owner_id      uuid REFERENCES app_user(id),
  remind_days   int[] NOT NULL DEFAULT '{90,30,7}',
  generated     boolean NOT NULL DEFAULT true,
  CHECK (origin_id IS NULL OR sandbox_id IS NOT NULL)
);
CREATE INDEX ON key_date (tenant_id, due_on) WHERE sandbox_id IS NULL;
CREATE INDEX ON key_date (lease_id);
CREATE UNIQUE INDEX key_date_overlay_origin ON key_date (sandbox_id, origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX ON key_date (sandbox_id) WHERE sandbox_id IS NOT NULL;

CREATE TABLE task (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  origin_id     uuid REFERENCES task(id) ON DELETE CASCADE,
  deleted_at    timestamptz,
  version       int NOT NULL DEFAULT 1,
  lease_id      uuid REFERENCES lease(id) ON DELETE CASCADE,
  key_date_id   uuid REFERENCES key_date(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  assignee_id   uuid REFERENCES app_user(id),
  due_on        date,
  priority      task_priority NOT NULL DEFAULT 'NORMAL',
  status        task_status NOT NULL DEFAULT 'TODO',
  created_by    uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CHECK (origin_id IS NULL OR sandbox_id IS NOT NULL)
);
CREATE INDEX ON task (tenant_id, status, due_on) WHERE sandbox_id IS NULL;
CREATE INDEX ON task (lease_id);
CREATE INDEX ON task (assignee_id);
CREATE UNIQUE INDEX task_overlay_origin ON task (sandbox_id, origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX ON task (sandbox_id) WHERE sandbox_id IS NOT NULL;

CREATE TABLE document (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_id      uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  kind          document_kind NOT NULL,
  title         text NOT NULL,
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    int NOT NULL,
  page_count    int,
  template      text,
  content       bytea,
  uploaded_by   uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((template IS NULL) <> (content IS NULL))
);
CREATE INDEX ON document (lease_id);

CREATE TABLE activity (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  sandbox_id  uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_id    uuid REFERENCES lease(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES app_user(id),
  verb        text NOT NULL,
  summary     text NOT NULL,
  diff        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON activity (lease_id, created_at DESC);
CREATE INDEX ON activity (tenant_id, created_at DESC);

CREATE TABLE lease_draft (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES app_user(id),
  lease_id      uuid REFERENCES lease(id) ON DELETE CASCADE,
  data          jsonb NOT NULL,
  current_step  text NOT NULL,
  version       int NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lease_draft (owner_id, updated_at DESC);

CREATE TABLE lease_modification (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  sandbox_id          uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  lease_id            uuid NOT NULL REFERENCES lease(id) ON DELETE CASCADE,
  effective_on        date NOT NULL,
  kind                modification_kind NOT NULL,
  before              jsonb NOT NULL,
  after               jsonb NOT NULL,
  revised_rate        numeric(9, 6),
  liability_change    numeric(18, 4) NOT NULL,
  rou_change          numeric(18, 4) NOT NULL,
  gain_loss           numeric(18, 4) NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES app_user(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lease_modification (lease_id, effective_on);

CREATE TABLE saved_view (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  sandbox_id    uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  origin_id     uuid REFERENCES saved_view(id) ON DELETE CASCADE,
  deleted_at    timestamptz,
  version       int NOT NULL DEFAULT 1,
  owner_id      uuid REFERENCES app_user(id),
  scope         view_scope NOT NULL,
  name          text NOT NULL,
  config        jsonb NOT NULL,
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (origin_id IS NULL OR sandbox_id IS NOT NULL)
);
CREATE INDEX ON saved_view (tenant_id, scope);
CREATE UNIQUE INDEX saved_view_overlay_origin ON saved_view (sandbox_id, origin_id) WHERE origin_id IS NOT NULL;

CREATE TABLE notification (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  sandbox_id  uuid REFERENCES sandbox(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notification (user_id, created_at DESC);

-- Operations ----------------------------------------------------------------

CREATE TABLE fx_rate (
  currency    char(3) NOT NULL,
  on_date     date NOT NULL,
  per_usd     numeric(18, 8) NOT NULL,
  PRIMARY KEY (currency, on_date)
);

CREATE TABLE web_vital (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  value       double precision NOT NULL,
  rating      text NOT NULL,
  route       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON web_vital (created_at);

CREATE TABLE csp_report (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  directive   text NOT NULL,
  blocked     text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON csp_report (created_at);

CREATE TABLE ops_check (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL,
  ok          boolean NOT NULL,
  detail      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Visible-row views --------------------------------------------------------
-- A row is visible when it is the caller's own overlay row, or a base row the caller has not replaced.
-- security_invoker makes row-level security apply to whoever queries the view.

CREATE VIEW v_lease WITH (security_invoker = true) AS
SELECT coalesce(l.origin_id, l.id) AS lease_id, l.*
FROM lease l
WHERE l.deleted_at IS NULL
  AND (l.sandbox_id = app.sandbox()
       OR (l.sandbox_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM lease o WHERE o.sandbox_id = app.sandbox() AND o.origin_id = l.id)));

CREATE VIEW v_key_date WITH (security_invoker = true) AS
SELECT coalesce(k.origin_id, k.id) AS key_date_id, k.*
FROM key_date k
WHERE k.deleted_at IS NULL
  AND (k.sandbox_id = app.sandbox()
       OR (k.sandbox_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM key_date o WHERE o.sandbox_id = app.sandbox() AND o.origin_id = k.id)));

CREATE VIEW v_task WITH (security_invoker = true) AS
SELECT coalesce(t.origin_id, t.id) AS task_id, t.*
FROM task t
WHERE t.deleted_at IS NULL
  AND (t.sandbox_id = app.sandbox()
       OR (t.sandbox_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM task o WHERE o.sandbox_id = app.sandbox() AND o.origin_id = t.id)));

CREATE VIEW v_saved_view WITH (security_invoker = true) AS
SELECT coalesce(s.origin_id, s.id) AS view_id, s.*
FROM saved_view s
WHERE s.deleted_at IS NULL
  AND (s.sandbox_id = app.sandbox()
       OR (s.sandbox_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM saved_view o WHERE o.sandbox_id = app.sandbox() AND o.origin_id = s.id)));

-- Row-level security --------------------------------------------------------
-- Reads: own tenant, and either base rows or the caller's own sandbox rows.
-- Writes: only into the caller's sandbox when one is set; base rows only when no sandbox is set.
-- FORCE is deliberately not used, so the owner role can dump and rebuild without row_security off.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['property','lease','lease_party','rent_step','escalation','lease_option','deposit',
                           'key_date','task','document','activity','lease_draft','lease_modification',
                           'saved_view','notification']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY read_visible ON %I FOR SELECT USING (
        tenant_id = app.tenant() AND (sandbox_id IS NULL OR sandbox_id = app.sandbox()))$p$, t);
    EXECUTE format($p$CREATE POLICY write_own ON %I FOR INSERT WITH CHECK (
        tenant_id = app.tenant() AND sandbox_id IS NOT DISTINCT FROM app.sandbox())$p$, t);
    EXECUTE format($p$CREATE POLICY update_own ON %I FOR UPDATE USING (
        tenant_id = app.tenant() AND sandbox_id IS NOT DISTINCT FROM app.sandbox())
        WITH CHECK (tenant_id = app.tenant() AND sandbox_id IS NOT DISTINCT FROM app.sandbox())$p$, t);
    EXECUTE format($p$CREATE POLICY delete_own ON %I FOR DELETE USING (
        tenant_id = app.tenant() AND sandbox_id IS NOT DISTINCT FROM app.sandbox())$p$, t);
  END LOOP;
END $$;

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_tenant ON app_user FOR SELECT USING (tenant_id = app.tenant() OR is_listed);

-- Resolves a session before any tenant is known. It returns only what the request needs to set its
-- scope, touches last_seen_at at most once a minute, and ignores expired sessions.
CREATE FUNCTION app.resolve_session(p_token_hash text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role user_role, sandbox_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH s AS (
    UPDATE session SET last_seen_at = now()
    WHERE token_hash = p_token_hash AND expires_at > now() AND last_seen_at < now() - interval '1 minute'
    RETURNING user_id, sandbox_id
  )
  SELECT u.id, u.tenant_id, u.role, x.sandbox_id
  FROM (SELECT user_id, sandbox_id FROM s
        UNION ALL
        SELECT user_id, sandbox_id FROM session WHERE token_hash = p_token_hash AND expires_at > now()
       ) x
  JOIN app_user u ON u.id = x.user_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_session(text) FROM PUBLIC;
