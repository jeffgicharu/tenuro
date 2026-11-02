-- Each shared lease's accounting figures, measured by the ledger engine when the data is built (the
-- nightly rebuild anchors "today"): carrying amounts, this year's charges and the maturity of the
-- remaining payments, in the lease's own currency. The portfolio summary adds these up instead of
-- running ten thousand schedules per request; leases a person has changed privately are measured
-- live by the API and replace their shared figures.

CREATE TABLE lease_accounting (
  lease_row_id     uuid PRIMARY KEY REFERENCES lease(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenant(id),
  measured_as      text NOT NULL,
  currency         text NOT NULL,
  as_of            date NOT NULL,
  liability        numeric(20, 4) NOT NULL,
  rou              numeric(20, 4) NOT NULL,
  interest_year    numeric(20, 4) NOT NULL,
  depreciation_year numeric(20, 4) NOT NULL,
  lease_cost_year  numeric(20, 4) NOT NULL,
  cash_year        numeric(20, 4) NOT NULL,
  within_1_year    numeric(20, 4) NOT NULL,
  year_1_to_2      numeric(20, 4) NOT NULL,
  year_2_to_3      numeric(20, 4) NOT NULL,
  year_3_to_4      numeric(20, 4) NOT NULL,
  year_4_to_5      numeric(20, 4) NOT NULL,
  after_5_years    numeric(20, 4) NOT NULL
);
CREATE INDEX ON lease_accounting (tenant_id);

ALTER TABLE lease_accounting ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_tenant ON lease_accounting FOR SELECT USING (tenant_id = app.tenant());
GRANT SELECT ON lease_accounting TO tenuro_app;
