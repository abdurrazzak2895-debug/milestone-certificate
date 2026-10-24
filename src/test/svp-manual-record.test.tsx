import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpManualRecordPanel } from "@/components/app/SvpManualRecordPanel";

const db = vi.hoisted(() => {
  const state: { rows: unknown[]; insertPayload: unknown } = { rows: [], insertPayload: null };
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: state.rows, error: null }),
    insert: (payload: unknown) => {
      state.insertPayload = payload;
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: "new-id" }, error: null }),
        }),
      };
    },
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "new-id" }, error: null }),
        }),
      }),
    }),
  };
  return { builder, state };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => db.builder },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);
beforeEach(() => {
  db.state.rows = [];
  db.state.insertPayload = null;
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SvpManualRecordPanel />
    </QueryClientProvider>,
  );
}

describe("manual SVP records", () => {
  it("marks candidate name and passport as required and allows drafts", () => {
    renderPanel();

    expect(screen.getByLabelText("Candidate name *")).toBeRequired();
    expect(screen.getByLabelText("Passport *")).toBeRequired();
    expect(
      screen.getByText(/Candidate name and passport are always required/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("blocks a draft without a candidate name", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Candidate name is required");
    expect(db.state.insertPayload).toBeNull();
  });

  it("saves a draft with only candidate name and passport", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Candidate name *"), {
      target: { value: "  Noor Rahman " },
    });
    fireEvent.change(screen.getByLabelText("Passport *"), {
      target: { value: " ab123456 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(db.state.insertPayload).not.toBeNull());
    expect(db.state.insertPayload).toEqual({
      candidate_name: "NOOR RAHMAN",
      passport: "AB123456",
      occupation: null,
      center: null,
      exam_date: null,
      exam_time: null,
      agency: null,
      login_email: null,
      reference_no: null,
      notes: null,
      status: "draft",
    });
  });
});
