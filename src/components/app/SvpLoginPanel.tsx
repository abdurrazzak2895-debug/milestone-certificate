import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { submitSvpLogin } from "@/lib/svp-session.functions";
import { svpLoginInputSchema, svpOtpInputSchema } from "@/lib/svp-session.shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui-bits";

type FormState = {
  login: string;
  password: string;
  otpAttempt: string;
};

type LoginStep = "login" | "otp";

type Status = { tone: "ok" | "error"; text: string };

const EMPTY_FORM: FormState = { login: "", password: "", otpAttempt: "" };

export function SvpLoginPanel() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState<LoginStep>("login");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const busyRef = useRef(false);

  const reset = () => {
    setForm({ ...EMPTY_FORM });
    setStep("login");
    setStatus(null);
    setShowPassword(false);
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
      setStatus({
        tone: "error",
        text: step === "login" ? "Enter the SVP username and password." : "Enter the OTP.",
      });
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const result =
        step === "login"
          ? await submitSvpLogin({ data: { ...parsed.data, step: "login" } })
          : await submitSvpLogin({ data: { ...parsed.data, step: "otp" } });

      setStatus({ tone: result.ok ? "ok" : "error", text: result.message });
      if (step === "login" && result.otpRequired) {
        setStep("otp");
      }
    } catch (error) {
      setStatus({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "The SVP request could not be completed. Try again.",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="svp-login-title"
    >
      <div>
        <h2 id="svp-login-title" className="text-xl font-bold">
          {step === "login" ? "SVP login" : "SVP OTP verification"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "login"
            ? "Enter the SVP username and password. SVP emails a one-time password once they are accepted."
            : `Enter the OTP sent for ${form.login}.`}
        </p>
      </div>

      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {step === "login" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SVP username">
              <Input
                name="login"
                value={form.login}
                onChange={(event) => update("login", event.target.value)}
                autoComplete="username"
                disabled={busy}
                required
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>
        ) : (
          <Field label="One-time password (OTP)">
            <Input
              name="otp"
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

      {status && (
        <p
          role={status.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${
            status.tone === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "bg-muted/40"
          }`}
        >
          {status.text}
        </p>
      )}
    </section>
  );
}
