import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSvpPaymentStatus,
  startSvpReservationPayment,
  type SvpPaymentSession,
} from "@/lib/svp-booking.functions";

type Props = {
  reservationId: string;
  amountHint?: number | null;
  /** Payment id returned by the provider redirect (?paymentId=). */
  initialPaymentId?: string | null;
  /** Start the provider checkout as soon as this component mounts. */
  autoStart?: boolean;
  /** Path (with optional query) the provider form posts back to; paymentId is appended. */
  returnTo?: string | null;
  onPaid?: (reservationId: string) => void;
};

type WidgetStatus = "idle" | "loading" | "ready" | "error";

const WIDGET_TIMEOUT_MS = 15_000;

type WpwlOptions = Record<string, unknown>;

/** Real SVP card payment: server-created HyperPay checkout + the official card widget. */
export function SvpCardPayment({
  reservationId,
  amountHint,
  initialPaymentId,
  autoStart = false,
  returnTo,
  onPaid,
}: Props) {
  const [session, setSession] = useState<SvpPaymentSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [paid, setPaid] = useState(false);
  const [widget, setWidget] = useState<WidgetStatus>("idle");
  const holderRef = useRef<HTMLDivElement | null>(null);
  const verifyTriedRef = useRef(false);

  const verify = useCallback(
    async (paymentId: string, silent = false) => {
      setChecking(true);
      try {
        const response = await getSvpPaymentStatus({ data: { paymentId } });
        if (!response.ok) {
          if (!silent) toast.error(response.message);
          return false;
        }
        if (response.data.paid) {
          setPaid(true);
          toast.success("Payment completed and verified with SVP.");
          onPaid?.(response.data.reservationId ?? reservationId);
          return true;
        }
        if (!silent) {
          toast.message(
            `SVP payment status: ${response.data.transactionStatus ?? "pending"}. Finish the card form if it is still open.`,
          );
        }
        return false;
      } catch (caught) {
        if (!silent) {
          toast.error(
            caught instanceof Error ? caught.message : "The payment status could not be checked.",
          );
        }
        return false;
      } finally {
        setChecking(false);
      }
    },
    [onPaid, reservationId],
  );

  // Returning from the provider: verify the payment id in the URL once.
  useEffect(() => {
    if (!initialPaymentId || verifyTriedRef.current) return;
    verifyTriedRef.current = true;
    void verify(initialPaymentId);
  }, [initialPaymentId, verify]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    setWidget("idle");
    try {
      const response = await startSvpReservationPayment({ data: { reservationId } });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setSession(response.data);
      if (!response.data.hyperpayUrl || !response.data.checkoutId) {
        setError(
          "SVP did not return a card checkout for this reservation. Pay in the official SVP portal.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The card payment could not be started.");
    } finally {
      setStarting(false);
    }
  }, [reservationId]);

  // A payment tab opens with autoStart so the secure card form appears without another click.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || initialPaymentId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void start();
  }, [autoStart, initialPaymentId, start]);

  // Mount the official HyperPay card widget once the checkout session exists.
  useEffect(() => {
    if (!session?.hyperpayUrl || !session.checkoutId) return;
    const holder = holderRef.current;
    if (!holder) return;

    setWidget("loading");
    holder.innerHTML = "";

    const form = document.createElement("form");
    const returnBase = returnTo || "/svp-booking";
    const separator = returnBase.includes("?") ? "&" : "?";
    form.action = `${window.location.origin}${returnBase}${separator}paymentId=${encodeURIComponent(
      session.paymentId,
    )}`;
    form.method = "GET";
    form.className = "paymentWidgets";
    form.setAttribute("data-brands", "VISA MASTER");
    holder.appendChild(form);

    // Widget options consumed by paymentWidgets.js (same shape the SVP portal uses).
    const options: WpwlOptions = {
      onSubmitCallback: () => {
        setWidget("loading");
      },
      onReady: () => setWidget("ready"),
      onError: () => {
        setWidget("error");
        setError("The card provider rejected the form. Start the payment again.");
      },
      labels: { cardHolder: "Card holder", cvv: "CVV" },
      showCVVHint: true,
      brandDetection: true,
      style: { base: { fontSize: "14px", lineHeight: "1.4" } },
    };
    (window as unknown as { wpwlOptions?: WpwlOptions }).wpwlOptions = options;

    document.head.querySelector("script[data-svp-payment]")?.remove();
    const script = document.createElement("script");
    script.dataset["svpPayment"] = "true";
    script.async = true;
    script.src = `${session.hyperpayUrl}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(
      session.checkoutId,
    )}`;
    if (session.integrity) {
      script.integrity = session.integrity;
      script.crossOrigin = "anonymous";
    }
    script.onerror = () => {
      setWidget("error");
      setError("The card provider could not be loaded. Check the connection and try again.");
    };
    document.head.appendChild(script);

    // The widget replaces the form; treat a mounted field as ready.
    const timer = window.setInterval(() => {
      if (holder.querySelector("iframe, .wpwl-control, input")) {
        setWidget("ready");
        window.clearInterval(timer);
      }
    }, 600);
    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setWidget((current) => (current === "ready" ? current : "error"));
    }, WIDGET_TIMEOUT_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
      script.remove();
      delete (window as unknown as { wpwlOptions?: WpwlOptions }).wpwlOptions;
    };
  }, [returnTo, session]);

  if (paid) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Payment verified with SVP. The reservation is confirmed.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4" /> Card payment (Visa / MasterCard)
        </p>
        {session?.amount != null && (
          <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
            {session.amount} SAR
          </span>
        )}
      </div>

      {!session && (
        <p className="text-xs text-muted-foreground">
          Start the official SVP card payment for reservation #{reservationId}
          {amountHint != null ? ` (about ${amountHint} SAR)` : ""}. Card details are entered in the
          provider&apos;s secure widget, never in this app.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {session && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Secure card form provided by the payment gateway
          </div>
          <div ref={holderRef} className="min-h-[8rem] rounded-lg border bg-card p-2" />
          {widget === "loading" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading the secure card form…
            </p>
          )}
          {widget === "error" && (
            <p className="flex items-start gap-2 text-xs text-amber-700">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The secure card form could not load. Restart the payment, or complete it in the
              official SVP portal.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Payment ID {session.paymentId}. After paying you are returned here and the payment is
            verified with SVP automatically.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!session ? (
          <Button type="button" size="sm" onClick={() => void start()} disabled={starting}>
            {starting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start card payment
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => void verify(session.paymentId)}
              disabled={checking}
            >
              {checking ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Check payment status
            </Button>
            {widget === "error" && (
              <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
                Restart payment
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Standalone payment tab opened right after a reservation is created: it starts the provider
 * checkout automatically and posts back here so the payment can be verified in the same tab.
 */
export function SvpPaymentPage({
  reservationId,
  initialPaymentId,
}: {
  reservationId: string;
  initialPaymentId?: string | null;
}) {
  const [paid, setPaid] = useState(false);
  return (
    <section className="card-surface mx-auto max-w-xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold">SVP card payment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reservation #{reservationId}. Card details are entered in the provider&apos;s secure
          widget, never in this app.
        </p>
      </div>
      <SvpCardPayment
        reservationId={reservationId}
        initialPaymentId={initialPaymentId}
        autoStart={!initialPaymentId}
        returnTo={`/svp-booking?payReservation=${encodeURIComponent(reservationId)}`}
        onPaid={() => setPaid(true)}
      />
      {paid && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm">
          Payment verified. You can close this tab and return to the booking page.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined") window.close();
          }}
        >
          Close this tab
        </Button>
        <a href="/svp-booking" className="text-sm font-medium text-primary underline">
          Back to SVP booking
        </a>
      </div>
    </section>
  );
}
