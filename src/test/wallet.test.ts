import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    from: () => ({
      insert: () => ({
        select: () => ({ single: mocks.single }),
      }),
    }),
  },
}));

import { describeWalletError, requestWalletDeposit } from "@/lib/wallet";

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.single.mockReset();
});

describe("wallet deposit request", () => {
  it("creates the request through the RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, id: "dep-1" }, error: null });
    await expect(
      requestWalletDeposit({ amount: 500, method: "bkash", reference: "TRX1" }),
    ).resolves.toEqual({ ok: true, id: "dep-1" });
  });

  it("reports the provider reason when the RPC rejects the request", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, reason: "invalid_amount" }, error: null });
    await expect(requestWalletDeposit({ amount: 0, method: "bkash" })).resolves.toEqual({
      ok: false,
      message: "invalid_amount",
    });
  });

  it("falls back to a direct insert when the RPC is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    mocks.single.mockResolvedValue({ data: { id: "dep-2" }, error: null });
    await expect(requestWalletDeposit({ amount: 300, method: "nagad" })).resolves.toEqual({
      ok: true,
      id: "dep-2",
    });
  });

  it("surfaces the database error when both paths fail", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    mocks.single.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(requestWalletDeposit({ amount: 300, method: "nagad" })).resolves.toEqual({
      ok: false,
      message: "permission denied",
    });
  });

  it("explains an unapplied wallet migration in plain language", () => {
    expect(
      describeWalletError("Could not find the table 'public.wallet_deposits' in the schema cache"),
    ).toContain("apply_wallet_system.sql");
  });
});
