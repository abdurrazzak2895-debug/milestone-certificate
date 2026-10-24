import { z } from "zod";

export const SVP_BOOKING_STATUSES = [
  "draft",
  "booked",
  "otp_pending",
  "slip_done",
  "cancelled",
  "archived",
] as const;

export type SvpBookingStatus = (typeof SVP_BOOKING_STATUSES)[number];

export const SVP_BOOKING_STATUS_LABEL: Record<SvpBookingStatus, string> = {
  draft: "Draft · manually recorded",
  booked: "Booked · manually recorded",
  otp_pending: "OTP pending · manually recorded",
  slip_done: "Slip done · manually recorded",
  cancelled: "Cancelled · local note only",
  archived: "Archived · local record",
};

export const SVP_BOOKING_STATUS_SHORT_LABEL: Record<SvpBookingStatus, string> = {
  draft: "Draft",
  booked: "Booked",
  otp_pending: "OTP pending",
  slip_done: "Slip done",
  cancelled: "Cancelled",
  archived: "Archived",
};

const text = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer`);
const optionalText = (max: number) => text(max).optional().or(z.literal(""));

const validCalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Enter a valid calendar date");

const validTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, for example 10:30");

export const svpBookingFormSchema = z
  .object({
    candidate_name: text(120).min(1, "Candidate name is required"),
    passport: text(20).regex(
      /^[A-Za-z0-9]{5,20}$/,
      "Use 5–20 letters and numbers for the passport",
    ),
    occupation: text(120),
    center: text(160),
    exam_date: z.string().trim(),
    exam_time: z.string().trim(),
    agency: optionalText(120),
    login_email: z
      .string()
      .trim()
      .max(254, "Use 254 characters or fewer")
      .email("Enter a valid email address")
      .optional()
      .or(z.literal("")),
    reference_no: optionalText(80),
    notes: optionalText(1000),
    status: z.enum(SVP_BOOKING_STATUSES).default("draft"),
  })
  .superRefine((value, context) => {
    const needsAppointmentDetails = value.status !== "draft" && value.status !== "archived";
    if (needsAppointmentDetails) {
      if (!value.occupation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["occupation"],
          message: "Occupation is required before recording this status",
        });
      }
      if (!value.center) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["center"],
          message: "Center is required before recording this status",
        });
      }
      if (!value.exam_date) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exam_date"],
          message: "Exam date is required before recording this status",
        });
      }
      if (!value.exam_time) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exam_time"],
          message: "Exam time is required before recording this status",
        });
      }
    }
    if (value.exam_date) {
      const result = validCalendarDate.safeParse(value.exam_date);
      if (!result.success)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exam_date"],
          message: result.error.issues[0]?.message ?? "Enter a valid date",
        });
    }
    if (value.exam_time) {
      const result = validTime.safeParse(value.exam_time);
      if (!result.success)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exam_time"],
          message: result.error.issues[0]?.message ?? "Enter a valid time",
        });
    }
  });

export type SvpBookingForm = z.input<typeof svpBookingFormSchema>;

export type SvpBookingRecord = {
  id: string;
  candidate_name: string;
  passport: string;
  occupation: string | null;
  center: string | null;
  exam_date: string | null;
  exam_time: string | null;
  agency: string | null;
  login_email: string | null;
  reference_no: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
};

export const emptySvpBookingForm: SvpBookingForm = {
  candidate_name: "",
  passport: "",
  occupation: "",
  center: "",
  exam_date: "",
  exam_time: "",
  agency: "",
  login_email: "",
  reference_no: "",
  notes: "",
  status: "draft",
};

export function normalizeSvpBookingForm(value: SvpBookingForm) {
  const parsed = svpBookingFormSchema.parse(value);
  return {
    ...parsed,
    candidate_name: parsed.candidate_name.toUpperCase(),
    passport: parsed.passport.toUpperCase(),
    occupation: parsed.occupation || null,
    center: parsed.center || null,
    exam_date: parsed.exam_date || null,
    exam_time: parsed.exam_time || null,
    agency: parsed.agency || null,
    login_email: parsed.login_email ? parsed.login_email.toLowerCase() : null,
    reference_no: parsed.reference_no || null,
    notes: parsed.notes || null,
  };
}

export function bookingFormFromRecord(record: SvpBookingRecord): SvpBookingForm {
  const status = SVP_BOOKING_STATUSES.includes(record.status as SvpBookingStatus)
    ? (record.status as SvpBookingStatus)
    : "draft";
  return {
    candidate_name: record.candidate_name,
    passport: record.passport,
    occupation: record.occupation ?? "",
    center: record.center ?? "",
    exam_date: record.exam_date ?? "",
    exam_time: record.exam_time ?? "",
    agency: record.agency ?? "",
    login_email: record.login_email ?? "",
    reference_no: record.reference_no ?? "",
    notes: record.notes ?? "",
    status,
  };
}

export function toSvpBookingInsert(value: ReturnType<typeof normalizeSvpBookingForm>) {
  return {
    candidate_name: value.candidate_name,
    passport: value.passport,
    occupation: value.occupation,
    center: value.center,
    exam_date: value.exam_date,
    exam_time: value.exam_time,
    agency: value.agency,
    login_email: value.login_email,
    reference_no: value.reference_no,
    notes: value.notes,
    status: value.status,
  };
}

export function toSvpBookingUpdate(value: ReturnType<typeof normalizeSvpBookingForm>) {
  return toSvpBookingInsert(value);
}

export function isSvpBookingStatus(value: string): value is SvpBookingStatus {
  return SVP_BOOKING_STATUSES.includes(value as SvpBookingStatus);
}
