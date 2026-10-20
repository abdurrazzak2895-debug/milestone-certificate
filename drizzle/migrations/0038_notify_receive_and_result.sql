CREATE OR REPLACE FUNCTION public.notify_submission_events()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _parent uuid; _info text; _t text; _k text;
BEGIN
  _parent := public.parent_agent_of(NEW.submitted_by);
  _info := NEW.candidate_name || ' — ' || NEW.passport_no || ' (রেফ: ' || NEW.ref_code || ')';
  IF TG_OP = 'INSERT' THEN
    IF _parent IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, submission_id, kind, title, body)
      VALUES (_parent, NEW.id, 'sub_agent_submit', 'সাব-এজেন্ট নতুন কাজ জমা দিয়েছেন', _info);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    _t := 'কাজ অনুমোদিত হয়েছে'; _k := 'approved';
    INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (NEW.submitted_by, NEW.id, _k, _t, _info);
    IF _parent IS NOT NULL THEN INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (_parent, NEW.id, _k, 'সাব-এজেন্টের ' || _t, _info); END IF;
  END IF;
  IF NEW.received_at IS NOT NULL AND OLD.received_at IS NULL THEN
    _t := 'পরীক্ষার্থী রিসিভ হয়েছে'; _k := 'received';
    INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (NEW.submitted_by, NEW.id, _k, _t, _info);
    IF _parent IS NOT NULL THEN INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (_parent, NEW.id, _k, _t, _info); END IF;
  END IF;
  IF NEW.svp_result IN ('PASS','FAIL') AND NEW.svp_result IS DISTINCT FROM OLD.svp_result THEN
    _t := CASE WHEN NEW.svp_result = 'PASS' THEN '🎉 রেজাল্ট: PASS' ELSE 'রেজাল্ট: FAIL' END; _k := 'result';
    INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (NEW.submitted_by, NEW.id, _k, _t, _info);
    IF _parent IS NOT NULL THEN INSERT INTO public.notifications(user_id, submission_id, kind, title, body) VALUES (_parent, NEW.id, _k, _t, _info); END IF;
  END IF;
  RETURN NEW;
END $function$;