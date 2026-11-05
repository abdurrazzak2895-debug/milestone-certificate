import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/svp-session.server", () => ({
  requireSvpAllowedRole: vi.fn(),
  readStoredSvpSession: () => null,
  svpAuthedRequest: request,
  svpAuthedBinary: vi.fn(),
  SvpSessionMissingError: class extends Error {},
}));
import {
  createSvpBooking,
  createSvpTargetedHold,
  rescheduleSvpBooking,
  rescheduleSvpSiteBooking,
} from "@/lib/svp-booking.functions";

// Exercise the server handlers with mocked transport, without real reservations or charges.
const context = { userId: "agent", supabase: {} };
const data = { occupationId: 11, categoryId: 2, examSessionId: "day-token", languageCode: "en" };
const ok = (payload: unknown) => ({ ok: true, status: 200, payload });
const invoke = (handler: unknown, input: object) =>
  (handler as (args: object) => Promise<{ ok: boolean; data?: Record<string, unknown> }>)({
    context,
    data: input,
  });
const writes = () =>
  request.mock.calls.filter(
    ([, path, options]) => String(path).includes("exam_reservations") && options?.method === "POST",
  );

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (_user, path) => {
    if (path.endsWith("validate_pending")) return ok({ can_proceed: true });
    if (path.endsWith("temporary_seats")) return ok({ exam_session_id: "assigned-token" });
    if (path.endsWith("exam_reservations")) return ok({ id: 123 });
    if (path.endsWith("permissions")) return ok({ free_reservations: true });
    return { ok: false, status: 503, payload: {} };
  });
});

describe("SVP reservation mutation safety", () => {
  it.each([0, "0", " 0 ", null, "", -1, 1.5])("rejects invalid assigned session %s", async (id) => {
    request.mockImplementation(async (_user, path) =>
      path.endsWith("temporary_seats")
        ? ok({ exam_session_id: id })
        : path.endsWith("validate_pending")
          ? ok({ can_proceed: true })
          : { ok: false, status: 503, payload: {} },
    );
    expect((await invoke(createSvpBooking, data)).ok).toBe(false);
    expect((await invoke(rescheduleSvpBooking, { ...data, reservationId: "123" })).ok).toBe(false);
    expect((await invoke(createSvpTargetedHold, data)).ok).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(request.mock.calls.filter(([, path]) => path.endsWith("temporary_seats"))).toHaveLength(
      3,
    );
  });

  it("does not create a reservation when the seat hold fails", async () => {
    request.mockImplementation(async (_user, path) =>
      path.endsWith("temporary_seats")
        ? { ok: false, status: 422, payload: { message: "Full" } }
        : ok({}),
    );
    expect((await invoke(createSvpBooking, data)).ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });

  it("uses the assigned session for a new reservation", async () => {
    await invoke(createSvpBooking, data);
    expect(writes()[0][2].body.exam_session_id).toBe("assigned-token");
  });

  it("uses the assigned session and every date token when rescheduling", async () => {
    const implementation = request.getMockImplementation()!;
    request.mockImplementation(async (...args) => {
      if (args[1].endsWith("/reschedule")) return ok({});
      return implementation(...args);
    });
    expect(
      (
        await invoke(rescheduleSvpBooking, {
          ...data,
          reservationId: "123",
          sessionIds: ["day-a", "day-b"],
          countryId: 4,
        })
      ).ok,
    ).toBe(true);
    const hold = request.mock.calls.find(([, path]) => path.endsWith("temporary_seats"));
    expect(hold?.[2].body).toMatchObject({
      exam_session_id: ["day-a", "day-b"],
      methodology: "in_person",
      country_id: 4,
    });
    expect(writes()[0][2].body.exam_session_id).toBe("assigned-token");
  });

  it("retries the site slot shape only after a validation rejection", async () => {
    let attempts = 0;
    request.mockImplementation(async (_user, path, options) => {
      if (path.endsWith("slots_availabilities")) return ok({ id: "hold" });
      if (options?.method === "POST") {
        attempts += 1;
        return attempts === 1 ? { ok: false, status: 422, payload: {} } : ok({});
      }
      return { ok: false, status: 503, payload: {} };
    });
    expect(
      (
        await invoke(rescheduleSvpSiteBooking, {
          ...data,
          reservationId: "123",
          examId: "exam",
          slotId: "slot",
          siteId: 4,
        })
      ).ok,
    ).toBe(true);
    expect(writes().map((call) => call[2].body.exam_session_id)).toEqual(["exam", "slot"]);
  });

  it("preserves the created reservation when settlement throws", async () => {
    const implementation = request.getMockImplementation()!;
    request.mockImplementation(async (...args) => {
      if (args[1].endsWith("permissions")) throw new Error("Network timeout");
      return implementation(...args);
    });
    const result = await invoke(createSvpBooking, data);
    expect(result).toMatchObject({
      ok: true,
      data: { reservationId: "123", paymentRequired: true, paymentStatusUnknown: true },
    });
    expect(writes()).toHaveLength(1);
  });

  it.each([{ siteId: 4 }, { holdId: "hold" }, { siteId: 4, holdId: "0" }])(
    "rejects incomplete site booking details %j",
    async (site) => {
      expect((await invoke(createSvpBooking, { ...data, ...site })).ok).toBe(false);
      expect(writes()).toHaveLength(0);
    },
  );

  it("does not use targeted holds for a site-based booking", async () => {
    await invoke(createSvpBooking, { ...data, siteId: 4, holdId: "slot-hold" });
    expect(request.mock.calls.some(([, path]) => path.endsWith("temporary_seats"))).toBe(false);
  });

  it("does not reschedule a site without a valid slot hold", async () => {
    request.mockImplementation(async (_user, path) =>
      path.endsWith("slots_availabilities") ? ok({}) : { ok: false, status: 503, payload: {} },
    );
    expect(
      (
        await invoke(rescheduleSvpSiteBooking, {
          ...data,
          reservationId: "123",
          examId: "exam",
          slotId: "slot",
          siteId: 4,
        })
      ).ok,
    ).toBe(false);
    expect(writes()).toHaveLength(0);
  });

  it.each([500, 503, 429, 401])(
    "does not retry site rescheduling after HTTP %s",
    async (status) => {
      request.mockImplementation(async (_user, path, options) => {
        if (path.endsWith("slots_availabilities")) return ok({ id: "hold" });
        if (options?.method === "POST") return { ok: false, status, payload: {} };
        return { ok: false, status: 503, payload: {} };
      });
      await invoke(rescheduleSvpSiteBooking, {
        ...data,
        reservationId: "123",
        examId: "exam",
        slotId: "slot",
        siteId: 4,
      });
      expect(writes()).toHaveLength(1);
      expect(request.mock.calls.some(([, path]) => path.endsWith("temporary_seats"))).toBe(false);
    },
  );
});
