CREATE OR REPLACE FUNCTION public.gen_ref_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public' AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
BEGIN
  LOOP
    c := '';
    FOR i IN 1..6 LOOP c := c || substr(chars, 1 + floor(random()*length(chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.job_submissions WHERE ref_code = c);
  END LOOP;
  RETURN c;
END $$;
ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS ref_code text;
UPDATE public.job_submissions SET ref_code = public.gen_ref_code() WHERE ref_code IS NULL;
ALTER TABLE public.job_submissions ALTER COLUMN ref_code SET DEFAULT public.gen_ref_code();
ALTER TABLE public.job_submissions ALTER COLUMN ref_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS job_submissions_ref_code_key ON public.job_submissions(ref_code);