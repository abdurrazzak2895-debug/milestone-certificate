import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSvpPaymentStatus,
  startSvpReservationPayment,
  type SvpPaymentSession,
} from "@/lib/svp-booking.functions";

type Props = {
  reservationId: string;
  amountHint?: number | null;
  onPaid?: (reservationId: string) => void;
};

const WIDGET_SCRIPT = /paymentWidgets\.js/;

/** Real SVP card payment: server-created payment session + official HyperPay widget. */
export function SvpCardPayment({ reservationId, amountHint, onPaid }: Props) {
  const [session, setSession] = useState<SvpPaymentSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [paid, setPaid] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await startSvpReservationPayment({ data: { reservationId } });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setSession(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The card payment could not be started.");
    } finally {
      setStarting(false);
    }
  };

  // Load the official provider widget once the checkout session exists.
  useEffect(() => {
    if (!session?.hyperpayUrl || !session.checkoutId || !holderRef.current) return;
    const holder = holderRef.current;
    holder.innerHTML = "";

    const form = document.createElement("form");
    form.action = `${window.location.origin}/svp-booking?paymentId=${encodeURIComponent(session.paymentId)}`;
    form.method = "GET";
    form.className = "paymentWidgets";
    form.setAttribute("data-brands", "VISA MASTER");
    holder.appendChild(form);

    const existing = document.head.querySelector("script[data-svp-payment]");
    existing?.remove();
    const script = document.createElement("script");
    script.dataset["svpPayment"] = "true";
    script.src = `${session.hyperpayUrl}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(
      session.checkoutId,
    )}`;
    if (session.integrity) {
      script.integrity = session.integrity;
      script.crossOrigin = "anonymous";
    }
    script.onerror = () =>
      setError("The card provider could not be loaded. Check the connection and try again.");
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [session]);

  const checkStatus = async () => {
    if (!session) return;
    setChecking(true);
    try {
      const response = await getSvpPaymentStatus({ data: { paymentId: session.paymentId } });
      if (!response.ok) {
        toast.error(response.message);
        return;
      }
      if (response.data.paid) {
        setPaid(true);
        toast.success("Payment completed and verified with SVP.");
        onPaid?.(response.data.reservationId ?? reservationId);
      } else {
        toast.message(
          `SVP payment status: ${response.data.transactionStatus ?? "pending"}. Complete the card form if it is still open.`,
        );
      }
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "The payment status could not be checked.",
      );
    } finally {
      setChecking(false);
    }
  };

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
          provider's secure widget, never in this app.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {session && (
        <div>
          <div ref={holderRef} className="min-h-[6rem]" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Payment ID {session.paymentId}. After paying, use “Check payment status” to verify it
            with SVP.
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
          <Button type="button" size="sm" onClick={() => void checkStatus()} disabled={checking}>
            {checking ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Check payment status
          </Button>
        )}
      </div>
    </div>
  );
}
