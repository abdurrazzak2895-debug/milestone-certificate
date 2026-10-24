import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  CalendarDays,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/app/ui-bits";
import {
  SVP_BOOKING_STATUSES,
  SVP_BOOKING_STATUS_LABEL,
  SVP_BOOKING_STATUS_SHORT_LABEL,
  bookingFormFromRecord,
  emptySvpBookingForm,
  isSvpBookingStatus,
  normalizeSvpBookingForm,
  svpBookingFormSchema,
  toSvpBookingInsert,
  toSvpBookingUpdate,
  type SvpBookingForm,
  type SvpBookingRecord,
  type SvpBookingStatus,
} from "@/lib/svp-booking.shared";

const BOOKING_COLUMNS =
  "id,candidate_name,passport,occupation,center,exam_date,exam_time,agency,login_email,reference_no,notes,status,created_at,created_by,updated_at";
const MAX_RECORDS = 200;

const bookingsQuery = {
  queryKey: ["svp_bookings", "manual-tracker"],
  queryFn: async (): Promise<SvpBookingRecord[]> => {
    const { data, error } = await supabase
      .from("svp_bookings")
      .select(BOOKING_COLUMNS)
      .order("exam_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(MAX_RECORDS);
    if (error) throw error;
    return data ?? [];
  },
  retry: false,
  refetchOnWindowFocus: false,
};

export function SvpManualRecordPanel() {
  const queryClient = useQueryClient();
  const bookings = useQuery(bookingsQuery);
  const [form, setForm] = useState<SvpBookingForm>(emptySvpBookingForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingRef = useRef(false);

  const records = useMemo(() => bookings.data ?? [], [bookings.data]);
  const visibleRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter((record) => {
      if (!showArchived && record.status === "archived") return false;
      if (!needle) return true;
      return [
        record.candidate_name,
        record.passport,
        record.occupation,
        record.center,
        record.agency,
        record.login_email,
        record.reference_no,
        record.status,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [records, search, showArchived]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: bookingsQuery.queryKey });
  const resetForm = () => {
    setForm(emptySvpBookingForm);
    setEditingId(null);
    setFormError(null);
  };

  const save = async () => {
    if (savingRef.current) return;
    const result = svpBookingFormSchema.safeParse(form);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? "Check the form and try again");
      return;
    }

    setFormError(null);
    savingRef.current = true;
    setSavingKey(editingId ?? "new");
    try {
      const normalized = normalizeSvpBookingForm(result.data);
      const response = editingId
        ? await supabase
            .from("svp_bookings")
            .update(toSvpBookingUpdate(normalized))
            .eq("id", editingId)
            .select("id")
            .single()
        : await supabase
            .from("svp_bookings")
            .insert(toSvpBookingInsert(normalized))
            .select("id")
            .single();
      if (response.error || !response.data?.id) {
        toast.error("Record could not be saved. Check access and try again.");
        return;
      }
      toast.success(editingId ? "Manual SVP record updated" : "Manual SVP record saved");
      resetForm();
      refresh();
    } catch {
      toast.error("Record could not be saved. Check access and try again.");
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  const changeStatus = async (record: SvpBookingRecord, nextStatus: string) => {
    if (savingRef.current || !isSvpBookingStatus(nextStatus) || nextStatus === record.status)
      return;
    if (nextStatus === "archived") return void archive(record);
    const nextForm = { ...bookingFormFromRecord(record), status: nextStatus };
    const result = svpBookingFormSchema.safeParse(nextForm);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Complete the required details first");
      return;
    }
    savingRef.current = true;
    setSavingKey(record.id);
    try {
      const normalized = normalizeSvpBookingForm(result.data);
      const { data: saved, error } = await supabase
        .from("svp_bookings")
        .update({ status: normalized.status })
        .eq("id", record.id)
        .select("id")
        .single();
      if (error || !saved?.id) {
        toast.error("Status could not be updated. Check access and try again.");
        return;
      }
      toast.success("Local status updated");
      refresh();
    } catch {
      toast.error("Status could not be updated. Check access and try again.");
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  const archive = async (record: SvpBookingRecord) => {
    if (savingRef.current) return;
    const confirmed = window.confirm(
      `Archive the local record for ${record.candidate_name} (${record.passport})? This will not cancel anything with SVP.`,
    );
    if (!confirmed) return;
    savingRef.current = true;
    setSavingKey(record.id);
    try {
      const { data: saved, error } = await supabase
        .from("svp_bookings")
        .update({ status: "archived" })
        .eq("id", record.id)
        .select("id")
        .single();
      if (error || !saved?.id) {
        toast.error("Record could not be archived. Check access and try again.");
        return;
      }
      if (editingId === record.id) resetForm();
      toast.success("Local record archived");
      refresh();
    } catch {
      toast.error("Record could not be archived. Check access and try again.");
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  const restore = async (record: SvpBookingRecord) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingKey(record.id);
    try {
      const { data: saved, error } = await supabase
        .from("svp_bookings")
        .update({ status: "draft" })
        .eq("id", record.id)
        .select("id")
        .single();
      if (error || !saved?.id) {
        toast.error("Record could not be restored. Check access and try again.");
        return;
      }
      toast.success("Local record restored as draft");
      refresh();
    } catch {
      toast.error("Record could not be restored. Check access and try again.");
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  const edit = (record: SvpBookingRecord) => {
    setEditingId(record.id);
    setForm(bookingFormFromRecord(record));
    setFormError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
        aria-labelledby="manual-record-title"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="manual-record-title" className="text-xl font-bold">
              {editingId ? "Edit manual record" : "Add manual record"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Candidate name and passport are always required. Save as Draft before appointment
              details are known.
            </p>
          </div>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetForm}
              disabled={!!savingKey}
            >
              <Plus className="mr-1 h-4 w-4" /> New record
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Candidate name *">
            <Input
              value={form.candidate_name}
              maxLength={120}
              autoComplete="off"
              required
              onChange={(event) => setForm({ ...form, candidate_name: event.target.value })}
              placeholder="Full name"
            />
          </Field>
          <Field label="Passport *">
            <Input
              value={form.passport}
              maxLength={20}
              autoComplete="off"
              required
              onChange={(event) => setForm({ ...form, passport: event.target.value })}
              placeholder="Passport number"
            />
          </Field>
          <Field label="Occupation">
            <Input
              value={form.occupation}
              maxLength={120}
              onChange={(event) => setForm({ ...form, occupation: event.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Center">
            <Input
              value={form.center}
              maxLength={160}
              onChange={(event) => setForm({ ...form, center: event.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Exam date">
            <Input
              type="date"
              value={form.exam_date}
              onChange={(event) => setForm({ ...form, exam_date: event.target.value })}
            />
          </Field>
          <Field label="Exam time">
            <Input
              type="time"
              value={form.exam_time}
              onChange={(event) => setForm({ ...form, exam_time: event.target.value })}
            />
          </Field>
          <Field label="Agency">
            <Input
              value={form.agency}
              maxLength={120}
              onChange={(event) => setForm({ ...form, agency: event.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Local reference no.">
            <Input
              value={form.reference_no}
              maxLength={80}
              onChange={(event) => setForm({ ...form, reference_no: event.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="SVP login email">
            <Input
              type="email"
              value={form.login_email}
              maxLength={254}
              autoComplete="off"
              onChange={(event) => setForm({ ...form, login_email: event.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Manual status">
            <NativeSelect
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as SvpBookingStatus })
              }
            >
              {SVP_BOOKING_STATUSES.map((status) => (
                <option key={status} value={status} disabled={status === "archived"}>
                  {SVP_BOOKING_STATUS_LABEL[status]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Notes">
            <Textarea
              rows={3}
              maxLength={1000}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Internal follow-up notes only"
            />
          </Field>
        </div>

        {formError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={!!savingKey}>
            {savingKey === (editingId ?? "new")
              ? "Saving…"
              : editingId
                ? "Save changes"
                : form.status === "draft"
                  ? "Save draft"
                  : "Save record"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm} disabled={!!savingKey}>
              Cancel edit
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="records-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="records-title" className="text-xl font-bold">
              Saved records
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Up to {MAX_RECORDS} records. Search applies to the loaded page only.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <label className="relative min-w-[min(100%,20rem)] flex-1 sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search loaded records"
                aria-label="Search loaded local SVP records"
              />
            </label>
            <Button
              type="button"
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive className="mr-1 h-4 w-4" />{" "}
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          </div>
        </div>

        {bookings.isPending && (
          <div
            className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"
            role="status"
          >
            Loading records…
          </div>
        )}
        {bookings.isError && (
          <div
            className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
            role="alert"
          >
            <p className="font-semibold">Records could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The table may be unavailable or your account may not have access.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void bookings.refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        )}
        {bookings.isSuccess && visibleRecords.length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {records.length === 0
              ? "No manual SVP records yet."
              : "No loaded records match this search or filter."}
          </div>
        )}
        {bookings.isSuccess && visibleRecords.length > 0 && (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Appointment details</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRecords.map((record) => (
                    <BookingRow
                      key={record.id}
                      record={record}
                      busy={!!savingKey}
                      onEdit={edit}
                      onStatus={changeStatus}
                      onArchive={archive}
                      onRestore={restore}
                      onPrint={printManualSummary}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {visibleRecords.map((record) => (
                <BookingCard
                  key={record.id}
                  record={record}
                  busy={!!savingKey}
                  onEdit={edit}
                  onStatus={changeStatus}
                  onArchive={archive}
                  onRestore={restore}
                  onPrint={printManualSummary}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type RowActions = {
  record: SvpBookingRecord;
  busy: boolean;
  onEdit: (record: SvpBookingRecord) => void;
  onStatus: (record: SvpBookingRecord, status: string) => void;
  onArchive: (record: SvpBookingRecord) => void;
  onRestore: (record: SvpBookingRecord) => void;
  onPrint: (record: SvpBookingRecord) => void;
};

function BookingRow({ record, busy, onEdit, onStatus, onArchive, onRestore, onPrint }: RowActions) {
  const knownStatus = isSvpBookingStatus(record.status) ? record.status : "draft";
  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <p className="font-semibold">{record.candidate_name}</p>
        <p className="font-mono text-xs text-muted-foreground">{record.passport}</p>
        {record.agency && <p className="mt-1 text-xs text-muted-foreground">{record.agency}</p>}
        {record.login_email && (
          <p className="max-w-[15rem] truncate text-xs text-muted-foreground">
            {record.login_email}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        <p>{record.occupation || "Occupation not recorded"}</p>
        <p className="text-xs text-muted-foreground">{record.center || "Center not recorded"}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(record.exam_date)}{" "}
          {record.exam_time || ""}
        </p>
        {record.reference_no && (
          <p className="mt-1 text-xs text-muted-foreground">Ref: {record.reference_no}</p>
        )}
      </td>
      <td className="px-4 py-4">
        <StatusSelect record={record} status={knownStatus} busy={busy} onStatus={onStatus} />
      </td>
      <td className="px-4 py-4">
        <ActionButtons
          record={record}
          busy={busy}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
          onPrint={onPrint}
        />
      </td>
    </tr>
  );
}

function BookingCard(props: RowActions) {
  const { record, busy, onEdit, onStatus, onArchive, onRestore, onPrint } = props;
  const knownStatus = isSvpBookingStatus(record.status) ? record.status : "draft";
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{record.candidate_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{record.passport}</p>
        </div>
        <StatusSelect record={record} status={knownStatus} busy={busy} onStatus={onStatus} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Occupation</span>
          <p>{record.occupation || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Center</span>
          <p>{record.center || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Exam</span>
          <p>
            {formatDate(record.exam_date)} {record.exam_time || ""}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Agency</span>
          <p>{record.agency || "—"}</p>
        </div>
      </div>
      {record.login_email && (
        <p className="truncate text-xs text-muted-foreground">{record.login_email}</p>
      )}
      <ActionButtons
        record={record}
        busy={busy}
        onEdit={onEdit}
        onArchive={onArchive}
        onRestore={onRestore}
        onPrint={onPrint}
      />
    </article>
  );
}

function StatusSelect({
  record,
  status,
  busy,
  onStatus,
}: {
  record: SvpBookingRecord;
  status: SvpBookingStatus;
  busy: boolean;
  onStatus: (record: SvpBookingRecord, status: string) => void;
}) {
  return (
    <NativeSelect
      aria-label={`Status for ${record.candidate_name}`}
      className="h-9 min-w-[10.5rem] text-xs"
      value={status}
      disabled={busy || status === "archived"}
      onChange={(event) => void onStatus(record, event.target.value)}
    >
      {SVP_BOOKING_STATUSES.map((option) => (
        <option key={option} value={option} disabled={option === "archived"}>
          {SVP_BOOKING_STATUS_SHORT_LABEL[option]}
        </option>
      ))}
    </NativeSelect>
  );
}

function ActionButtons({
  record,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onPrint,
}: {
  record: SvpBookingRecord;
  busy: boolean;
  onEdit: (record: SvpBookingRecord) => void;
  onArchive: (record: SvpBookingRecord) => void;
  onRestore: (record: SvpBookingRecord) => void;
  onPrint: (record: SvpBookingRecord) => void;
}) {
  const archived = record.status === "archived";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {!archived && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onEdit(record)}
          disabled={busy}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onPrint(record)}
        disabled={busy}
      >
        <FileText className="mr-1 h-3.5 w-3.5" /> Summary
      </Button>
      {archived ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onRestore(record)}
          disabled={busy}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void onArchive(record)}
          disabled={busy}
        >
          <Archive className="mr-1 h-3.5 w-3.5" /> Archive
        </Button>
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Date not recorded";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function printManualSummary(record: SvpBookingRecord) {
  const popup = window.open("", "_blank");
  if (!popup) {
    toast.error("Allow pop-ups to print the summary");
    return;
  }
  popup.opener = null;
  const escapeHtml = (value: string | null | undefined) =>
    (value || "—").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character] ?? character,
    );
  const status = isSvpBookingStatus(record.status)
    ? SVP_BOOKING_STATUS_LABEL[record.status]
    : record.status;
  const row = (label: string, value: string | null | undefined) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  const localRef = record.reference_no || `LOCAL-${record.id.slice(0, 8).toUpperCase()}`;

  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Manual SVP record ${escapeHtml(localRef)}</title><style>@page{size:A4;margin:15mm}body{font-family:system-ui,sans-serif;color:#172033;margin:0}.header{border-bottom:2px solid #172033;padding-bottom:12px}h1{margin:0;font-size:22px}.meta{color:#475569;font-size:13px;margin-top:4px}.notice{margin:18px 0;padding:12px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;font-size:13px;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:9px;text-align:left;font-size:14px}th{width:32%;background:#f1f5f9}.footer{margin-top:24px;color:#64748b;font-size:12px}</style></head><body><div class="header"><h1>Manual SVP record</h1><div class="meta">Milestone Certificate Institute · local reference ${escapeHtml(localRef)}</div></div><div class="notice"><strong>Not an official appointment slip.</strong> This printout is a local tracking summary only.</div><table>${row("Candidate name", record.candidate_name)}${row("Passport", record.passport)}${row("Occupation", record.occupation)}${row("Center", record.center)}${row("Exam date", formatDate(record.exam_date))}${row("Exam time", record.exam_time)}${row("Agency", record.agency)}${row("SVP login email", record.login_email)}${row("Manual status", status)}${row("Notes", record.notes)}</table><div class="footer">Printed locally: ${escapeHtml(new Date().toLocaleString("en-GB"))}</div></body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
}
