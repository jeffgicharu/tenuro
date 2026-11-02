-- Year-to-date movement of each shared lease's liability (whole periods ended by the build date), and
-- this year's monthly charge, so the accounting page can show a roll-forward and a monthly P&L. The
-- defaults keep rows from before this migration valid until the next rebuild fills them.

ALTER TABLE lease_accounting
  ADD COLUMN exempt              boolean NOT NULL DEFAULT false,
  ADD COLUMN liability_open      numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN additions_ytd       numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN interest_ytd        numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN payments_ytd        numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN remeasure_ytd       numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN liability_close     numeric(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN monthly_interest    numeric(20, 4)[] NOT NULL DEFAULT '{}',
  ADD COLUMN monthly_depreciation numeric(20, 4)[] NOT NULL DEFAULT '{}',
  ADD COLUMN monthly_cost        numeric(20, 4)[] NOT NULL DEFAULT '{}';
