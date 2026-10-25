import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { saveSvpLocalBookingRecord, type SvpLocalRecordPayload } from "@/lib/svp-local-record";

const payload: SvpLocalRecordPayload = {
  candidate_name: "Noor Rahman",
  passport: "ab123456",
  occupation: "Welder",
  center: "Dhaka Center",
  exam_date: "2026-11-05",
  exam_time: "09:30",
  agency: null,
  login_email: "noor@example.com",
  reference_no: "R-123",
  notes: "SVP R-123: Reservation created.",
  status: "booked",
};

function createClient() {
  const single = vi.fn().mockResolvedValue({ data: { id: "local-1" }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const lookup = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const inserted = { select: vi.fn().mockReturnValue({ single }) };
  const insert = vi.fn().mockReturnValue(inserted);
  const table = { select: vi.fn().mockReturnValue(lookup), insert };
  const from = vi.fn().mockReturnValue(table);
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "app-user-1" } }, error: null });
  const client = { auth: { getUser }, from } as unknown as SupabaseClient<Database>;
  return { client, from, getUser, lookup, insert, single, maybeSingle };
}

beforeEach(() => vi.clearAllMocks());

describe("SVP post-success local record persistence", () => {
  it("normalizes and saves a row bound to the signed-in app user", async () => {
    const mocks = createClient();
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).resolves.toBe("local-1");
    expect(mocks.from).toHaveBeenCalledWith("svp_bookings");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate_name: "NOOR RAHMAN",
        passport: "AB123456",
        agency: null,
        created_by: "app-user-1",
        reference_no: "R-123",
      }),
    );
  });

  it("recovers a previously saved own reference without another insert", async () => {
    const mocks = createClient();
    mocks.maybeSingle.mockResolvedValue({ data: { id: "prior-row" }, error: null });
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).resolves.toBe("prior-row");
    expect(mocks.lookup.eq).toHaveBeenCalledWith("reference_no", "R-123");
    expect(mocks.lookup.eq).toHaveBeenCalledWith("created_by", "app-user-1");
    expect(mocks.lookup.limit).toHaveBeenCalledWith(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not save identity-only data without a successful reservation reference", async () => {
    const mocks = createClient();
    await expect(
      saveSvpLocalBookingRecord(mocks.client, { ...payload, reference_no: null }),
    ).rejects.toThrow("reference");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects invalid candidate identity before any database access", async () => {
    const mocks = createClient();
    await expect(
      saveSvpLocalBookingRecord(mocks.client, { ...payload, passport: "AB-123" }),
    ).rejects.toThrow();
    await expect(
      saveSvpLocalBookingRecord(mocks.client, { ...payload, candidate_name: " " }),
    ).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not report success for zero-row or failed database responses", async () => {
    const mocks = createClient();
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).rejects.toThrow(
      "could not be saved",
    );
    mocks.single.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).rejects.toThrow(
      "could not be saved",
    );
  });

  it("fails closed on lookup errors and missing app sessions", async () => {
    const mocks = createClient();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).rejects.toThrow(
      "could not be checked",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(saveSvpLocalBookingRecord(mocks.client, payload)).rejects.toThrow("Sign in");
  });
});
