ALTER TABLE public.ttc_centers ADD COLUMN IF NOT EXISTS address text;
UPDATE public.ttc_centers SET address = 'ঘোড়াপট্টি, সাতমাথা (১০০ ফিট দক্ষিণে), বগুড়া — একাডেমিক ভবন, ৩য় তলা, কক্ষ ৩০৮' WHERE name = 'বগুড়া' AND address IS NULL;

CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  agent_id uuid,
  ttc_id uuid REFERENCES public.ttc_centers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sms_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.sms_templates(id) ON DELETE CASCADE,
  schedule text NOT NULL DEFAULT 'today',
  send_hour int NOT NULL DEFAULT 8,
  custom_at timestamptz,
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  last_run_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  automation_id uuid REFERENCES public.sms_automations(id) ON DELETE SET NULL,
  submission_id uuid,
  recipient_name text,
  phone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX sms_messages_status_idx ON public.sms_messages(status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates, public.sms_automations, public.sms_messages TO authenticated;
GRANT ALL ON public.sms_templates, public.sms_automations, public.sms_messages TO service_role;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all" ON public.sms_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all" ON public.sms_automations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin read" ON public.sms_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));