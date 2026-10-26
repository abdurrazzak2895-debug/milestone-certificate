import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SVP_BOOKING_COST_BDT } from "@/lib/svp-booking.shared";
import { cancelStaleSvpBookings } from "@/lib/svp-pending-cancel";

type BookingRow = {
  id: string;
  candidate_name: string;
  passport: string;
  occupation: string | null;
  center: string | null;
  exam_date: string | null;
  exam_time: string | null;
  reference_no: string | null;
  status: string;
  agency: string | null;
  login_email: string | null;
  created_by: string | null;
  created_at: string;
};

type Profile = { id: string; full_name: string | null; email: string | null };

const STATUS_FILTERS = [
  { key: "all", label: "সব" },
  { key: "completed", label: "Complite" },
  { key: "cancelled", label: "Cancel" },
  { key: "pending", label: "Pending" },
] as const;

function statusKind(status: string): "completed" | "cancelled" | "pending" {
  if (/cancel/i.test(status)) return "cancelled";
  if (/booked|completed|reserved|confirmed|slip/i.test(status)) return "completed";
  return "pending";
}

function tone(kind: string): string {
  if (kind === "completed") return "border-emerald-300/60 bg-emerald-500/15 text-emerald-300";
  if (kind === "cancelled") return "border-rose-300/60 bg-rose-500/15 text-rose-300";
  return "border-amber-300/60 bg-amber-500/15 text-amber-300";
}

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

/** Admin view: every SVP booking recorded by our system, with the ৳100 fee summary. */
export function SvpBookingAdminHistory() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["key"]>("all");

  const bookingsQuery = useQuery({
    queryKey: ["admin-svp-bookings"],
    queryFn: async (): Promise<BookingRow[]> => {
      await cancelStaleSvpBookings();
      const { data, error } = await supabase
        .from("svp_bookings")
        .select(
          "id, candidate_name, passport, occupation, center, exam_date, exam_time, reference_no, status, agency, login_email, created_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as BookingRow[];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const profilesQuery = useQuery({
    queryKey: ["admin-svp-profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const profileName = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      map.set(profile.id, profile.full_name ?? profile.email ?? profile.id);
    }
    return map;
  }, [profiles]);

  const counts = useMemo(() => {
    const base = { all: bookings.length, completed: 0, cancelled: 0, pending: 0 };
    for (const booking of bookings) base[statusKind(booking.status)] += 1;
    return base;
  }, [bookings]);

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return bookings
      .filter((booking) => status === "all" || statusKind(booking.status) === status)
      .filter(
        (booking) =>
          !needle ||
          [
            booking.candidate_name,
            booking.passport,
            booking.reference_no ?? "",
            booking.occupation ?? "",
            booking.center ?? "",
            booking.login_email ?? "",
            booking.created_by ? (profileName.get(booking.created_by) ?? "") : "",
          ].some((value) => value.toLowerCase().includes(needle)),
      );
  }, [bookings, profileName, search, status]);

  const totalCost = counts.all * SVP_BOOKING_COST_BDT;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">SVP বুকিং হিস্ট্রি</h1>
          <p className="text-xs text-muted-foreground">
            সব এজেন্টের SVP বুকিং রেকর্ড — Complite, Cancel, Pending ও বুকিং ফি ৳
            {SVP_BOOKING_COST_BDT}।
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
          <p className="text-xs text-muted-foreground">Total bookings</p>
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
          <p className="text-xs text-muted-foreground">Booking cost (মোট)</p>
          <p className="mt-1 text-2xl font-bold text-sky-400">
            ৳{totalCost.toLocaleString("en-BD")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="নাম / পাসপোর্ট / রেফারেন্স / এজেন্ট দিয়ে খুঁজুন"
            className="pl-9"
          />
        </div>
        {STATUS_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setStatus(entry.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              status === entry.key
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
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading the SVP booking history…
        </p>
      ) : bookingsQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          SVP বুকিং হিস্ট্রি লোড করা যায়নি।
        </p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          এই ফিল্টারে কোনো SVP বুকিং নেই।
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((booking) => {
            const kind = statusKind(booking.status);
            return (
              <div key={booking.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{booking.candidate_name}</p>
                    <p className="text-xs text-muted-foreground">
                      #{booking.reference_no ?? booking.id} · {booking.passport}
                      {booking.agency ? ` · ${booking.agency}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone(kind)}`}
                    >
                      {kind === "completed"
                        ? "Complite"
                        : kind === "cancelled"
                          ? "Cancel"
                          : "Pending"}
                    </span>
                    <span className="rounded-full border border-sky-300/60 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                      ৳{SVP_BOOKING_COST_BDT}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {formatDateTime(booking.exam_date)}
                    {booking.exam_time ? ` · ${booking.exam_time}` : ""}
                  </span>
                  <span>পেশা: {booking.occupation ?? "—"}</span>
                  <span>কেন্দ্র: {booking.center ?? "—"}</span>
                  <span>
                    এজেন্ট:{" "}
                    {booking.created_by
                      ? (profileName.get(booking.created_by) ?? booking.created_by)
                      : (booking.login_email ?? "—")}
                  </span>
                  <span className="sm:col-span-2">তৈরি: {formatDateTime(booking.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
