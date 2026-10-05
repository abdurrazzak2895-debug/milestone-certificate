-- lovable-cron-fallback-reviewed: existing 5-minute SVP poll kept unchanged; only replaces its auth header with a private token
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.cron_tokens (name text PRIMARY KEY, token text NOT NULL);
REVOKE ALL ON private.cron_tokens FROM PUBLIC, anon, authenticated;
INSERT INTO private.cron_tokens(name, token)
VALUES ('svp_results', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT EXISTS (SELECT 1 FROM private.cron_tokens WHERE name = _name AND token = _token AND length(_token) >= 32)
$$;
REVOKE ALL ON FUNCTION public.verify_cron_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text, text) TO service_role;

SELECT cron.unschedule('check-svp-results-every-five-minutes');
SELECT cron.schedule('check-svp-results-every-five-minutes', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://project--ddcce996-ede7-44c7-bd4a-a1c942f16dec.lovable.app/api/public/cron/svp-results',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select token from private.cron_tokens where name = 'svp_results')),
    body := '{}'::jsonb
  ) as request_id;
$cron$);