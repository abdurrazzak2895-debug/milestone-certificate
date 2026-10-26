import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LoaderCircle, RefreshCw, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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

type Kind = "completed" | "cancelled" | "pending";

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
  sortAt: string;
};

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "completed", label: "Complite" },
  { key: "cancelled", label: "Cancel" },
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
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function kindLabel(kind: Kind): string {
  if (kind === "completed") return "Complite";
  if (kind === "cancelled") return "Cancel";
  return "Pending";
}

/** Free SVP booking history recorded by our own system (no live SVP/payment calls). */
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

  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);

  const rows = useMemo<HistoryRow[]>(
    () =>
      bookings
        .map((booking) => {
          const cancelled = /cancel/i.test(booking.status);
          const completed = /booked|completed|reserved|confirmed/i.test(booking.status);
          const kind: Kind = cancelled ? "cancelled" : completed ? "completed" : "pending";
          return {
            key: booking.id,
            reference: booking.reference_no ?? booking.id,
            candidate: booking.candidate_name,
            passport: booking.passport,
            occupation: booking.occupation,
            center: booking.center,
            examDate: booking.exam_date,
            examTime: booking.exam_time,
            status: booking.status,
            kind,
            sortAt: booking.created_at,
          };
        })
        .sort((a, b) => (b.sortAt ?? "").localeCompare(a.sortAt ?? "")),
    [bookings],
  );

  const counts = useMemo(() => {
    const base: Record<"all" | Kind, number> = {
      all: rows.length,
      completed: 0,
      cancelled: 0,
      pending: 0,
    };
    for (const row of rows) base[row.kind] += 1;
    return base;
  }, [rows]);

  const list = filter === "all" ? rows : rows.filter((row) => row.kind === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">SVP বুকিং হিস্ট্রি</h2>
          <p className="text-xs text-muted-foreground">
            আমাদের নিজের ফ্রি বুকিং সিস্টেমের রেকর্ড — Complite, Cancel ও Free booking.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void bookingsQuery.refetch()}
          disabled={bookingsQuery.isFetching}
        >
          <RefreshCw
            className={`mr-1 h-3.5 w-3.5 ${bookingsQuery.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Refresh
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
          <p className="text-xs text-muted-foreground">Free booking</p>
          <p className="mt-1 text-2xl font-bold text-sky-400">{counts.all}</p>
          <p className="text-[11px] text-muted-foreground">Card charge নেই</p>
        </div>
      </div>

      {bookingsQuery.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          আপনার SVP বুকিং রেকর্ড লোড করা যায়নি। আবার চেষ্টা করুন।
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

      {bookingsQuery.isPending ? (
        <p className="flex items-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading the booking history…
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
                    {row.passport ? ` · ${row.passport}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindTone(row.kind)}`}
                  >
                    {kindLabel(row.kind)}
                  </span>
                  <span className="rounded-full border border-sky-300/60 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                    Free
                  </span>
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {formatDateTime(row.examDate)}
                  {row.examTime ? ` · ${row.examTime}` : ""}
                </span>
                <span>পেশা: {row.occupation ?? "—"}</span>
                <span>কেন্দ্র: {row.center ?? "—"}</span>
                <span>Free booking — কোনো কার্ড চার্জ নেই।</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
