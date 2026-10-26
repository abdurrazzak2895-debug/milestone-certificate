import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, LoaderCircle, RefreshCw, Ticket, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  getSvpAccountOverview,
  listSvpPayments,
  listSvpReservations,
} from "@/lib/svp-booking.functions";
import type { SvpPaymentRow } from "@/lib/svp-api.shared";

type LocalBooking = {
  id: string;
  candidate_name: string;
  passport: string;
  occupation: string | null;
  center: string | null;
  exam_date: string | null;
  exam_time: string | null;
  reference_no: string | null;
  status: string;
  created_at: string;
  notes: string | null;
};

type Kind = "completed" | "cancelled" | "free" | "paid" | "pending";

type HistoryRow = {
  key: string;
  reference: string;
  candidate: string;
  passport: string;
  occupation: string | null;
  center: string | null;
  examDate: string | null;
  examTime: string | null;
  status: string;
  kind: Kind;
  amount: number | null;
  local: boolean;
  sortAt: string;
};

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "completed", label: "Complite" },
  { key: "cancelled", label: "Cancel" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value.replace(" ", "T");
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindTone(kind: Kind): string {
  switch (kind) {
    case "completed":
      return "border-emerald-300/60 bg-emerald-500/15 text-emerald-300";
    case "cancelled":
      return "border-rose-300/60 bg-rose-500/15 text-rose-300";
    case "free":
      return "border-sky-300/60 bg-sky-500/15 text-sky-300";
    case "paid":
      return "border-amber-300/60 bg-amber-500/15 text-amber-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function kindLabel(kind: Kind): string {
  switch (kind) {
    case "completed":
      return "Complite";
    case "cancelled":
      return "Cancel";
    case "free":
      return "Free booking";
    case "paid":
      return "Paid (card debit)";
    default:
      return "Pending";
  }
}

/** Booking history for the signed-in user: local records + live SVP status/payments. */
export function SvpBookingHistory() {
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const bookingsQuery = useQuery({
    queryKey: ["my-svp-bookings", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<LocalBooking[]> => {
      const { data, error } = await supabase
        .from("svp_bookings")
        .select(
          "id, candidate_name, passport, occupation, center, exam_date, exam_time, reference_no, status, created_at, notes",
        )
        .eq("created_by", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LocalBooking[];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const reservationsQuery = useQuery({
    queryKey: ["svp-history-reservations"],
    queryFn: () => listSvpReservations(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const paymentsQuery = useQuery({
    queryKey: ["svp-history-payments"],
    queryFn: () => listSvpPayments(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const overviewQuery = useQuery({
    queryKey: ["svp-history-overview"],
    queryFn: () => getSvpAccountOverview({ data: { occupationId: null } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const reservations = useMemo(
    () => (reservationsQuery.data?.ok ? reservationsQuery.data.data : []),
    [reservationsQuery.data],
  );
  const payments = useMemo(
    () => (paymentsQuery.data?.ok ? paymentsQuery.data.data : []),
    [paymentsQuery.data],
  );
  const overview = overviewQuery.data?.ok ? overviewQuery.data.data : null;
  const freeReservations = overview?.permissions.freeReservations ?? false;
  const credits = overview?.credits ?? 0;
  const svpError =
    (reservationsQuery.data && !reservationsQuery.data.ok
      ? reservationsQuery.data.message
      : null) ?? (paymentsQuery.data && !paymentsQuery.data.ok ? paymentsQuery.data.message : null);

  const paymentByReservation = useMemo(() => {
    const map = new Map<string, SvpPaymentRow>();
    for (const payment of payments) {
      if (payment.reservationId) map.set(payment.reservationId, payment);
    }
    return map;
  }, [payments]);

  const rows = useMemo<HistoryRow[]>(() => {
    const out: HistoryRow[] = [];
    const seen = new Set<string>();
    for (const booking of bookings) {
      const reference = booking.reference_no ?? booking.id;
      const live = reservations.find((entry) => entry.id === booking.reference_no);
      const payment = booking.reference_no
        ? paymentByReservation.get(booking.reference_no)
        : undefined;
      const status = live?.status ?? booking.status;
      const cancelled = /cancel/i.test(status);
      const completed = /completed|reserved|confirmed/i.test(status);
      const kind: Kind = cancelled
        ? "cancelled"
        : completed
          ? "completed"
          : payment
            ? "paid"
            : freeReservations
              ? "free"
              : "pending";
      out.push({
        key: `local-${booking.id}`,
        reference,
        candidate: booking.candidate_name,
        passport: booking.passport,
        occupation: booking.occupation,
        center: live?.centerName ?? booking.center,
        examDate: live?.startAt ?? booking.exam_date,
        examTime: live?.startAt ? null : booking.exam_time,
        status,
        kind,
        amount: payment?.amount ?? null,
        local: true,
        sortAt: live?.startAt ?? booking.created_at,
      });
      if (booking.reference_no) seen.add(booking.reference_no);
    }
    for (const reservation of reservations) {
      if (seen.has(reservation.id)) continue;
      const payment = paymentByReservation.get(reservation.id);
      const status = reservation.status ?? "unknown";
      const cancelled = /cancel/i.test(status);
      const completed = /completed|reserved|confirmed/i.test(status);
      out.push({
        key: `svp-${reservation.id}`,
        reference: reservation.id,
        candidate: reservation.laborName ?? "SVP candidate",
        passport: "—",
        occupation: reservation.occupationName ?? reservation.occupationEnglishName,
        center: reservation.centerName ?? reservation.city,
        examDate: reservation.startAt,
        examTime: null,
        status,
        kind: cancelled
          ? "cancelled"
          : completed
            ? "completed"
            : payment
              ? "paid"
              : freeReservations
                ? "free"
                : "pending",
        amount: payment?.amount ?? null,
        local: false,
        sortAt: reservation.startAt ?? "",
      });
    }
    return out.sort((a, b) => (b.sortAt ?? "").localeCompare(a.sortAt ?? ""));
  }, [bookings, freeReservations, paymentByReservation, reservations]);

  const counts = useMemo(() => {
    const base: Record<"all" | Kind, number> = {
      all: rows.length,
      completed: 0,
      cancelled: 0,
      free: 0,
      paid: 0,
      pending: 0,
    };
    for (const row of rows) base[row.kind] += 1;
    return base;
  }, [rows]);

  const cardDebit = useMemo(
    () =>
      payments
        .filter((payment) => /success|completed|paid/i.test(payment.transactionStatus ?? ""))
        .reduce((total, payment) => total + (payment.amount ?? 0), 0),
    [payments],
  );

  const list = filter === "all" ? rows : rows.filter((row) => row.kind === filter);
  const loading =
    bookingsQuery.isPending ||
    reservationsQuery.isPending ||
    paymentsQuery.isPending ||
    overviewQuery.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">SVP বুকিং হিস্ট্রি</h2>
          <p className="text-xs text-muted-foreground">
            Complite, Cancel, Free booking এবং credit/card debit — local record + live SVP status.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void bookingsQuery.refetch();
            void reservationsQuery.refetch();
            void paymentsQuery.refetch();
            void overviewQuery.refetch();
          }}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Ticket className="h-3.5 w-3.5" /> Total bookings
          </p>
          <p className="mt-1 text-2xl font-bold">{counts.all}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Complite</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{counts.completed}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Cancel</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{counts.cancelled}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Credits / Card debit
          </p>
          <p className="mt-1 text-sm font-semibold">
            {credits} credit · {cardDebit} SAR debit
          </p>
        </div>
      </div>

      {svpError && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-950">
          Live SVP history is unavailable for this account: {svpError}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              filter === entry.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted"
            }`}
          >
            {entry.label} ({counts[entry.key]})
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading the SVP booking history…
        </p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          এই ক্যাটাগরিতে কোনো SVP বুকিং নেই।
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((row) => (
            <div key={row.key} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.candidate}</p>
                  <p className="text-xs text-muted-foreground">
                    #{row.reference}
                    {row.passport && row.passport !== "—" ? ` · ${row.passport}` : ""}
                    {row.local ? "" : " · SVP record"}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindTone(row.kind)}`}
                >
                  {kindLabel(row.kind)}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {formatDateTime(row.examDate)}
                  {row.examTime ? ` · ${row.examTime}` : ""}
                </span>
                <span>পেশা: {row.occupation ?? "—"}</span>
                <span>কেন্দ্র: {row.center ?? "—"}</span>
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  {row.amount != null
                    ? `${row.amount} SAR debit`
                    : row.kind === "free"
                      ? "Free booking"
                      : "No card debit"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
