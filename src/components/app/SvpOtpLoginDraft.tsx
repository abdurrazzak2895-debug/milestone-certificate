import { useRef, useState, type FormEvent } from "react";
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

type FormState = {
  login: string;
  password: string;
  otpAttempt: string;
};

type LoginStep = "login" | "otp";

const EMPTY_FORM: FormState = { login: "", password: "", otpAttempt: "" };

export function SvpOtpLoginDraft() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState<LoginStep>("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<SvpResponseSummary | null>(null);
  const busyRef = useRef(false);

  const reset = () => {
    setForm({ ...EMPTY_FORM });
    setStep("login");
    setNotice(null);
    setSummary(null);
  };

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;

    const parsed =
      step === "login"
        ? svpLoginInputSchema.safeParse({ login: form.login, password: form.password })
        : svpOtpInputSchema.safeParse({
            login: form.login,
            password: form.password,
            otpAttempt: form.otpAttempt,
          });

    if (!parsed.success) {
      setNotice(step === "login" ? "Enter your SVP username and password." : "Enter the OTP.");
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
        setStep("otp");
        setNotice(
          "The login request returned an HTTP success response. If SVP sent a code, enter it below. The API response schema is undocumented, so this does not confirm an authenticated session.",
        );
      } else if (step === "otp" && result.ok) {
        setNotice(
          "The OTP request returned an HTTP success response. No SVP session is stored or confirmed because the response contract is undocumented.",
        );
      } else {
        setNotice("The SVP request was not accepted. No authenticated session is confirmed.");
      }
    } catch {
      setSummary(null);
      setNotice("The SVP request could not be completed. No authenticated session is confirmed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="svp-login-title"
    >
      <div>
        <h2 id="svp-login-title" className="text-xl font-bold">
          {step === "login" ? "Sign in to SVP" : "Verify your OTP"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          System settings are supplied by the integration. Your username, password, and OTP stay in
          this form’s memory and are not saved to app storage.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="leading-relaxed">
          Login/OTP draft only. The supplied collection has no response examples. An HTTP success
          does not prove SVP authentication, and no appointment booking or payment is performed.
        </p>
      </div>

      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {step === "login" ? (
          <div className="space-y-4">
            <Field label="SVP username">
              <Input
                value={form.login}
                onChange={(event) => update("login", event.target.value)}
                autoComplete="username"
                disabled={busy}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                autoComplete="current-password"
                disabled={busy}
                required
              />
            </Field>
          </div>
        ) : (
          <Field label="One-time password (OTP)">
            <Input
              value={form.otpAttempt}
              onChange={(event) => update("otpAttempt", event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={busy}
              required
            />
          </Field>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Please wait…" : step === "login" ? "Continue" : "Verify OTP"}
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
          <h3 className="font-semibold">Request result</h3>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">HTTP status</dt>
              <dd>{summary.httpStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Response type</dt>
              <dd>{summary.responseKind}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
