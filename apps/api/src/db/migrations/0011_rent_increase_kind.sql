-- A fixed uplift is a rent increase, not a review: a review is a negotiation, an increase simply
-- takes effect. Key dates for fixed steps use their own kind (the nightly rebuild writes them).
ALTER TYPE key_date_kind ADD VALUE IF NOT EXISTS 'RENT_INCREASE' AFTER 'RENT_REVIEW';
