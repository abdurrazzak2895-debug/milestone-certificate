import { useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCcw, ShieldAlert } from "lucide-react";
import { submitSvpSessionDraft } from "@/lib/svp-session.functions";
import {
  svpLoginInputSchema,
  svpOtpInputSchema,
  type SvpResponseSummary,
} from "@/lib/svp-session.shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui-bits";

type DraftForm = {
  login: string;
  password: string;
  feApp: string;
  otpMethod: string;
  locale: string;
  otpAttempt: string;
};

type DraftStep = "login" | "otp";

function emptyDraftForm(): DraftForm {
  return {
    login: "",
    password: "",
    feApp: "",
    otpMethod: "",
    locale: "",
    otpAttempt: "",
  };
}

export function SvpOtpLoginDraft() {
  const [form, setForm] = useState<DraftForm>(emptyDraftForm);
  const [step, setStep] = useState<DraftStep>("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<SvpResponseSummary | null>(null);
  const busyRef = useRef(false);
  const credentialsRef = useRef<DraftForm | null>(null);

  useEffect(() => {
    return () => {
      credentialsRef.current = null;
      busyRef.current = false;
    };
  }, []);

  const reset = () => {
    credentialsRef.current = null;
    busyRef.current = false;
    setForm(emptyDraftForm());
    setStep("login");
    setBusy(false);
    setNotice(null);
    setSummary(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;

    const parsed =
      step === "login"
        ? svpLoginInputSchema.safeParse({
            login: form.login,
            password: form.password,
            feApp: form.feApp,
            otpMethod: form.otpMethod,
            locale: form.locale,
          })
        : svpOtpInputSchema.safeParse({
            login: form.login,
            password: form.password,
            feApp: form.feApp,
            otpMethod: form.otpMethod,
            locale: form.locale,
            otpAttempt: form.otpAttempt,
          });

    if (!parsed.success) {
      setNotice("Complete the required fields before submitting.");
      setSummary(null);
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result =
        step === "login"
          ? await submitSvpSessionDraft({ data: { ...parsed.data, step: "login" } })
          : await submitSvpSessionDraft({ data: { ...parsed.data, step: "otp" } });
      setSummary(result);

      if (step === "login" && result.ok) {
        credentialsRef.current = { ...form };
        setStep("otp");
        setNotice(
          "The request was accepted by HTTP. If the official portal sent an OTP, enter it below. This draft does not verify an SVP session.",
        );
      } else if (result.ok) {
        setNotice(
          "The OTP request was accepted by HTTP. This draft does not verify an SVP authenticated session.",
        );
      } else {
        setNotice("The request was not accepted by HTTP. No SVP login or session is verified.");
      }
    } catch {
      setSummary(null);
      setNotice("The SVP request could not be completed. No login or session is verified.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const update = (key: keyof DraftForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section
      className="mx-auto max-w-2xl space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="svp-otp-draft-title"
    >
      <div>
        <h2 id="svp-otp-draft-title" className="text-xl font-bold">
          SVP OTP login draft
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A client-side draft for a signed-in admin, staff, or agent user. Values remain in React
          memory only while this form is mounted.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="leading-relaxed">
          API draft only. Response schemas were not supplied. An HTTP-accepted request is not the
          same as an SVP authenticated session and does not confirm anything for booking. This draft
          is not used to book or pay.
        </p>
      </div>

      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SVP login">
            <Input
              value={form.login}
              onChange={(event) => update("login", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          <Field label="fe_app">
            <Input
              value={form.feApp}
              onChange={(event) => update("feApp", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          <Field label="otp_method">
            <Input
              value={form.otpMethod}
              onChange={(event) => update("otpMethod", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          <Field label="locale">
            <Input
              value={form.locale}
              onChange={(event) => update("locale", event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          {step === "otp" && (
            <Field label="OTP attempt">
              <Input
                value={form.otpAttempt}
                onChange={(event) => update("otpAttempt", event.target.value)}
                autoComplete="one-time-code"
                disabled={busy}
              />
            </Field>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : step === "login" ? "Send login request" : "Submit OTP attempt"}
          </Button>
          <Button type="button" variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </form>

      {notice && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm" role="status">
          {notice}
        </p>
      )}

      {summary && (
        <div className="rounded-xl border p-4 text-sm" aria-label="Sanitized SVP response summary">
          <h3 className="font-semibold">Sanitized response summary</h3>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">HTTP status</dt>
              <dd>{summary.httpStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">HTTP ok</dt>
              <dd>{summary.ok ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Content type</dt>
              <dd>{summary.contentType ?? "not provided"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Response kind</dt>
              <dd>{summary.responseKind}</dd>
            </div>
          </dl>
          <p className="mt-2 text-muted-foreground">
            Top-level field names:{" "}
            {summary.topLevelFieldNames.length > 0 ? summary.topLevelFieldNames.join(", ") : "none"}
          </p>
        </div>
      )}
    </section>
  );
}
