-- The runtime role reads everything it needs and writes only workflow data.
-- It has no DDL rights; the owner role runs migrations, the nightly rebuild and backups.

GRANT USAGE ON SCHEMA public, app TO tenuro_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO tenuro_app;

GRANT SELECT ON tenant, app_user, fx_rate TO tenuro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sandbox, session TO tenuro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  property, lease, lease_party, rent_step, escalation, lease_option, deposit,
  key_date, task, document, activity, lease_draft, lease_modification, saved_view, notification
TO tenuro_app;
GRANT SELECT ON v_lease, v_key_date, v_task, v_saved_view TO tenuro_app;
GRANT INSERT, SELECT, DELETE ON web_vital, csp_report TO tenuro_app;
GRANT SELECT ON ops_check TO tenuro_app;
