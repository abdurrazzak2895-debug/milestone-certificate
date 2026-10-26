import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { cancelStaleSvpBookings } from "@/lib/svp-pending-cancel";

beforeEach(() => {
  mocks.rpc.mockReset();
});

describe("pending SVP booking sweep", () => {
  it("cancels stale drafts through the RPC and returns the count", async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    await expect(cancelStaleSvpBookings()).resolves.toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_stale_svp_bookings", { _minutes: 30 });
  });

  it("never throws when the RPC is unavailable", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    await expect(cancelStaleSvpBookings()).resolves.toBe(0);
  });
});
