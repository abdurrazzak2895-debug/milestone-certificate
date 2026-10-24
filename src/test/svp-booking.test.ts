import { describe, expect, it } from "vitest";
import {
  normalizeSvpBookingForm,
  svpBookingFormSchema,
  toSvpBookingInsert,
  toSvpBookingUpdate,
} from "@/lib/svp-booking.shared";

const base = {
  candidate_name: "  Noor Rahman ",
  passport: "  ab123456 ",
  occupation: "Welder",
  center: "Dhaka TTC",
  exam_date: "2026-11-05",
  exam_time: "09:30",
  agency: "  North Star  ",
  login_email: "NOOR@EXAMPLE.COM",
  reference_no: " local-7 ",
  notes: " Follow up locally ",
  status: "booked" as const,
};

describe("SVP manual booking validation", () => {
  it("normalizes names and passport to uppercase and optional text to null", () => {
    const normalized = normalizeSvpBookingForm({
      ...base,
      agency: "",
      reference_no: "",
      notes: "",
    });

    expect(normalized.candidate_name).toBe("NOOR RAHMAN");
    expect(normalized.passport).toBe("AB123456");
    expect(normalized.agency).toBeNull();
    expect(normalized.reference_no).toBeNull();
    expect(normalized.notes).toBeNull();
    expect(normalized.login_email).toBe("noor@example.com");
  });

  it("enforces the database passport character and length rules before saving", () => {
    for (const passport of ["ABC", "AB 123456", "AB-123456", "A".repeat(21)]) {
      expect(svpBookingFormSchema.safeParse({ ...base, passport }).success).toBe(false);
    }
    expect(svpBookingFormSchema.safeParse({ ...base, passport: " ab123456 " }).success).toBe(true);
  });

  it("rejects impossible calendar dates and invalid 24-hour times", () => {
    expect(() => svpBookingFormSchema.parse({ ...base, exam_date: "2026-02-31" })).toThrow(
      "valid calendar date",
    );
    expect(() => svpBookingFormSchema.parse({ ...base, exam_time: "25:90" })).toThrow(
      "24-hour time",
    );
  });

  it("allows a draft with only candidate identity but requires details for a booked record", () => {
    const draft = svpBookingFormSchema.parse({
      candidate_name: "Noor Rahman",
      passport: "AB123456",
      occupation: "",
      center: "",
      exam_date: "",
      exam_time: "",
      agency: "",
      login_email: "",
      reference_no: "",
      notes: "",
      status: "draft",
    });
    expect(draft.status).toBe("draft");

    const invalidBooked = svpBookingFormSchema.safeParse({
      ...draft,
      status: "booked",
    });
    expect(invalidBooked.success).toBe(false);
    if (!invalidBooked.success) {
      expect(invalidBooked.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["occupation", "center", "exam_date", "exam_time"]),
      );
    }
  });

  it("always requires candidate name and passport, even for drafts", () => {
    const draft = {
      candidate_name: "Noor Rahman",
      passport: "AB123456",
      occupation: "",
      center: "",
      exam_date: "",
      exam_time: "",
      agency: "",
      login_email: "",
      reference_no: "",
      notes: "",
      status: "draft" as const,
    };

    expect(svpBookingFormSchema.safeParse({ ...draft, candidate_name: "   " }).success).toBe(false);
    expect(svpBookingFormSchema.safeParse({ ...draft, passport: "" }).success).toBe(false);
    expect(svpBookingFormSchema.safeParse(draft).success).toBe(true);
  });

  it("keeps immutable database fields out of insert and update payloads", () => {
    const normalized = normalizeSvpBookingForm(base);
    const insert = toSvpBookingInsert(normalized);
    const update = toSvpBookingUpdate(normalized);

    expect(insert).toEqual({
      candidate_name: "NOOR RAHMAN",
      passport: "AB123456",
      occupation: "Welder",
      center: "Dhaka TTC",
      exam_date: "2026-11-05",
      exam_time: "09:30",
      agency: "North Star",
      login_email: "noor@example.com",
      reference_no: "local-7",
      notes: "Follow up locally",
      status: "booked",
    });
    expect(update).toEqual(insert);
    expect(insert).not.toHaveProperty("id");
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("created_by");
    expect(insert).not.toHaveProperty("updated_at");
  });
});
