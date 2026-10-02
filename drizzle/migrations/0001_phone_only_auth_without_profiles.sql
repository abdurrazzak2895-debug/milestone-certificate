CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Phone-only authentication intentionally stores no additional profile or role row.
  RETURN NEW;
END;
$$;