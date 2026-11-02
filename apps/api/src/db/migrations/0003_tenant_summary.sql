-- Public figures for the sign-in page, readable before anyone is signed in: how many base leases
-- each company holds and in which countries. Nothing else crosses the tenant boundary.
CREATE FUNCTION app.tenant_summary()
RETURNS TABLE (tenant_id uuid, lease_count int, countries text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tenant_id, count(*)::int, array_agg(DISTINCT country_code::text ORDER BY country_code::text)
  FROM lease
  WHERE sandbox_id IS NULL
  GROUP BY tenant_id
$$;
REVOKE ALL ON FUNCTION app.tenant_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tenant_summary() TO tenuro_app;
