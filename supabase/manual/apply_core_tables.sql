-- Core application tables reconstructed from src/integrations/supabase/types.ts.
-- Apply AFTER apply_core_functions.sql.

CREATE TABLE IF NOT EXISTS public.appointment_extractions (
  confidence numeric,
  correction_reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  error text,
  extracted jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_exam_at timestamptz,
  reviewed_at timestamptz DEFAULT now(),
  reviewed_by uuid,
  status text,
  submission_id uuid,
  verified_exam_at timestamptz,
  verified_reporting_time text,
  warnings jsonb
);
ALTER TABLE public.appointment_extractions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_extractions TO authenticated;
GRANT ALL ON public.appointment_extractions TO service_role;
CREATE TABLE IF NOT EXISTS public.candidates (
  arrival_status text,
  created_at timestamptz DEFAULT now(),
  date_of_birth text,
  district text,
  fee_amount numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text,
  name text,
  needs_follow_up boolean,
  notes text,
  occupation_id text,
  passport_expiry text,
  passport_no text,
  photo_url text,
  received_at timestamptz DEFAULT now(),
  received_by uuid,
  registration_no text,
  result_check_at timestamptz,
  secondary_mobile text,
  skill_details text,
  ttc_id text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
CREATE TABLE IF NOT EXISTS public.device_sessions (
  prev_session_key text,
  session_key text,
  updated_at timestamptz DEFAULT now(),
  user_id uuid PRIMARY KEY
);
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO authenticated;
GRANT ALL ON public.device_sessions TO service_role;
CREATE TABLE IF NOT EXISTS public.exams (
  candidate_id uuid,
  created_at timestamptz DEFAULT now(),
  exam_date text,
  exam_time text,
  exam_type text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occupation_id text,
  remarks text,
  result public.exam_result,
  result_date text DEFAULT now(),
  result_last_checked_at timestamptz,
  score numeric,
  submission_id uuid,
  ttc_id text
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
CREATE TABLE IF NOT EXISTS public.job_submissions (
  arrival_status text,
  candidate_id uuid,
  candidate_name text,
  candidate_photo_path text,
  created_at timestamptz DEFAULT now(),
  education text,
  exam_at timestamptz,
  exam_id uuid,
  experience text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text,
  occupation_id text,
  ocr_meta jsonb,
  passport_no text,
  received_at timestamptz DEFAULT now(),
  received_by uuid,
  ref_code text,
  ref_no numeric,
  rejection_reason text,
  reviewed_at timestamptz DEFAULT now(),
  reviewed_by uuid,
  secondary_mobile text,
  skill_details text,
  status text,
  submitted_by uuid,
  svp_checked_at timestamptz,
  svp_exam_date text,
  svp_old_result text,
  svp_result text,
  terms_accepted boolean,
  ticket_path text,
  ttc_id text
);
ALTER TABLE public.job_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_submissions TO authenticated;
GRANT ALL ON public.job_submissions TO service_role;
CREATE TABLE IF NOT EXISTS public.notifications (
  body text,
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text,
  read boolean,
  submission_id uuid,
  title text,
  user_id uuid
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
CREATE TABLE IF NOT EXISTS public.occupations (
  active boolean,
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  svp_key text
);
ALTER TABLE public.occupations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occupations TO authenticated;
GRANT ALL ON public.occupations TO service_role;
CREATE TABLE IF NOT EXISTS public.payments (
  amount numeric,
  candidate_id uuid,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text,
  reviewed_at timestamptz DEFAULT now(),
  reviewed_by uuid,
  sender text,
  status text,
  trx_id text
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
CREATE TABLE IF NOT EXISTS public.phone_otps (
  attempts numeric,
  code_hash text,
  expires_at timestamptz,
  last_sent_at timestamptz,
  phone text PRIMARY KEY
);
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_otps TO authenticated;
GRANT ALL ON public.phone_otps TO service_role;
CREATE TABLE IF NOT EXISTS public.receive_status_log (
  changed_at timestamptz DEFAULT now(),
  changed_by text,
  changed_by_name text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_status text,
  old_status text,
  submission_id uuid
);
ALTER TABLE public.receive_status_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receive_status_log TO authenticated;
GRANT ALL ON public.receive_status_log TO service_role;
CREATE TABLE IF NOT EXISTS public.reminders (
  candidate_id uuid,
  created_at timestamptz DEFAULT now(),
  done boolean,
  due_date text DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
CREATE TABLE IF NOT EXISTS public.results (
  candidate_id uuid,
  created_at timestamptz DEFAULT now(),
  exam_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result public.exam_result,
  result_date text DEFAULT now(),
  score numeric,
  source text
);
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;
GRANT ALL ON public.results TO service_role;
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value text
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
CREATE TABLE IF NOT EXISTS public.sms_automations (
  active boolean,
  created_at timestamptz DEFAULT now(),
  custom_at timestamptz,
  filter jsonb,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_run_on text DEFAULT now(),
  name text,
  schedule text,
  send_hour numeric,
  template_id uuid
);
ALTER TABLE public.sms_automations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_automations TO authenticated;
GRANT ALL ON public.sms_automations TO service_role;
CREATE TABLE IF NOT EXISTS public.sms_log (
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text,
  ok boolean,
  phone text,
  ref_key text
);
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_log TO authenticated;
GRANT ALL ON public.sms_log TO service_role;
CREATE TABLE IF NOT EXISTS public.sms_messages (
  automation_id uuid,
  body text,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  dedupe_key text,
  error text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  recipient_name text,
  sent_at timestamptz DEFAULT now(),
  status text,
  submission_id uuid
);
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;
CREATE TABLE IF NOT EXISTS public.sms_templates (
  agent_id text,
  body text,
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  ttc_id text
);
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_templates TO service_role;
CREATE TABLE IF NOT EXISTS public.ttc_centers (
  active boolean,
  address text,
  created_at timestamptz DEFAULT now(),
  district text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  sort_order numeric
);
ALTER TABLE public.ttc_centers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ttc_centers TO authenticated;
GRANT ALL ON public.ttc_centers TO service_role;
CREATE TABLE IF NOT EXISTS public.work_notes (
  author_id uuid,
  body text,
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text,
  submission_id uuid
);
ALTER TABLE public.work_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_notes TO authenticated;
GRANT ALL ON public.work_notes TO service_role;
DROP POLICY IF EXISTS appointment_extractions_staff_all ON public.appointment_extractions;
CREATE POLICY appointment_extractions_staff_all ON public.appointment_extractions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY appointment_extractions_own_select ON public.appointment_extractions FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY appointment_extractions_own_insert ON public.appointment_extractions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY appointment_extractions_own_update ON public.appointment_extractions FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS candidates_staff_all ON public.candidates;
CREATE POLICY candidates_staff_all ON public.candidates FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS device_sessions_staff_all ON public.device_sessions;
CREATE POLICY device_sessions_staff_all ON public.device_sessions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY device_sessions_own_select ON public.device_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY device_sessions_own_insert ON public.device_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY device_sessions_own_update ON public.device_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS exams_staff_all ON public.exams;
CREATE POLICY exams_staff_all ON public.exams FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS job_submissions_staff_all ON public.job_submissions;
CREATE POLICY job_submissions_staff_all ON public.job_submissions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY job_submissions_own_select ON public.job_submissions FOR SELECT TO authenticated USING (submitted_by = auth.uid());
CREATE POLICY job_submissions_own_insert ON public.job_submissions FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY job_submissions_own_update ON public.job_submissions FOR UPDATE TO authenticated USING (submitted_by = auth.uid()) WITH CHECK (submitted_by = auth.uid());
DROP POLICY IF EXISTS notifications_staff_all ON public.notifications;
CREATE POLICY notifications_staff_all ON public.notifications FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY notifications_own_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_own_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS occupations_staff_all ON public.occupations;
CREATE POLICY occupations_staff_all ON public.occupations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY occupations_read_auth ON public.occupations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS payments_staff_all ON public.payments;
CREATE POLICY payments_staff_all ON public.payments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY payments_own_select ON public.payments FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY payments_own_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY payments_own_update ON public.payments FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS phone_otps_staff_all ON public.phone_otps;
CREATE POLICY phone_otps_staff_all ON public.phone_otps FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS receive_status_log_staff_all ON public.receive_status_log;
CREATE POLICY receive_status_log_staff_all ON public.receive_status_log FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS reminders_staff_all ON public.reminders;
CREATE POLICY reminders_staff_all ON public.reminders FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY reminders_read_auth ON public.reminders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS results_staff_all ON public.results;
CREATE POLICY results_staff_all ON public.results FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS settings_staff_all ON public.settings;
CREATE POLICY settings_staff_all ON public.settings FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY settings_read_auth ON public.settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sms_automations_staff_all ON public.sms_automations;
CREATE POLICY sms_automations_staff_all ON public.sms_automations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY sms_automations_read_auth ON public.sms_automations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sms_log_staff_all ON public.sms_log;
CREATE POLICY sms_log_staff_all ON public.sms_log FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS sms_messages_staff_all ON public.sms_messages;
CREATE POLICY sms_messages_staff_all ON public.sms_messages FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS sms_templates_staff_all ON public.sms_templates;
CREATE POLICY sms_templates_staff_all ON public.sms_templates FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY sms_templates_read_auth ON public.sms_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ttc_centers_staff_all ON public.ttc_centers;
CREATE POLICY ttc_centers_staff_all ON public.ttc_centers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY ttc_centers_read_auth ON public.ttc_centers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS work_notes_staff_all ON public.work_notes;
CREATE POLICY work_notes_staff_all ON public.work_notes FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY work_notes_own_select ON public.work_notes FOR SELECT TO authenticated USING (author_id = auth.uid());
CREATE POLICY work_notes_own_insert ON public.work_notes FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY work_notes_own_update ON public.work_notes FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());