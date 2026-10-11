CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  submission_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_submission_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _parent uuid;
BEGIN
  _parent := public.parent_agent_of(NEW.submitted_by);
  IF TG_OP = 'INSERT' THEN
    IF _parent IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, submission_id, kind, title, body)
      VALUES (_parent, NEW.id, 'sub_agent_submit', 'সাব-এজেন্ট নতুন কাজ জমা দিয়েছেন', NEW.candidate_name || ' — ' || NEW.passport_no || ' (রেফ: ' || NEW.ref_code || ')');
    END IF;
  ELSIF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.notifications(user_id, submission_id, kind, title, body)
    VALUES (NEW.submitted_by, NEW.id, 'approved', 'আপনার কাজ অনুমোদিত হয়েছে', NEW.candidate_name || ' — ' || NEW.passport_no || ' (রেফ: ' || NEW.ref_code || ')');
    IF _parent IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, submission_id, kind, title, body)
      VALUES (_parent, NEW.id, 'approved', 'সাব-এজেন্টের কাজ অনুমোদিত হয়েছে', NEW.candidate_name || ' — ' || NEW.passport_no || ' (রেফ: ' || NEW.ref_code || ')');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_submission_events AFTER INSERT OR UPDATE OF status ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_submission_events();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;