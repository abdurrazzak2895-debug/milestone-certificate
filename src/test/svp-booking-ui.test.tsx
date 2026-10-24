import type { ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roles: ["staff"] as string[],
  records: [] as Record<string, unknown>[],
  loadError: null as { message: string } | null,
  insert: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useRouteContext: () => ({ roles: mocks.roles }),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: mocks.records, error: mocks.loadError }),
          }),
        }),
      }),
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return { select: () => ({ single: mocks.single }) };
      },
      update: (payload: unknown) => {
        mocks.update(payload);
        return { eq: () => ({ select: () => ({ single: mocks.single }) }) };
      },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
// The real form components are used; stub only the unrelated data module imported by ui-bits.
vi.mock("@/lib/data", () => ({ RESULT_LABEL: {}, fmtDate: (value: string) => value }));

import { Route } from "@/routes/_authenticated/svp-booking";

function showForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
  return client;
}

function fillDraft() {
  fireEvent.change(screen.getByLabelText("Candidate name *"), {
    target: { value: "Test Candidate" },
  });
  fireEvent.change(screen.getByLabelText("Passport *"), { target: { value: "ab123456" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles = ["staff"];
  mocks.records = [];
  mocks.loadError = null;
  mocks.single.mockResolvedValue({ data: { id: "synthetic-record-id" }, error: null });
});
afterEach(() => cleanup());

describe("SVP manual tracker UI without live writes", () => {
  it("allows staff to save only a normalized local draft", async () => {
    showForm();
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Save local record" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Manual SVP record saved"));
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
      passport: "AB123456",
      status: "draft",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText("Manual / local record only")).toBeInTheDocument();
  });

  it("keeps user input and reports failure when the database rejects a save", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "denied" } });
    showForm();
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Save local record" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("could not be saved")),
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Passport *")).toHaveValue("ab123456");
  });

  it("does not report success for an update with no affected row", async () => {
    mocks.records = [
      {
        id: "synthetic-record-id",
        candidate_name: "TEST CANDIDATE",
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
        created_at: "2026-10-24T00:00:00Z",
        created_by: null,
        updated_at: "2026-10-24T00:00:00Z",
      },
    ];
    mocks.single.mockResolvedValue({ data: null, error: null });
    showForm();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0),
    );
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("could not be saved")),
    );
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("blocks duplicate submits while the first save is pending", async () => {
    let finish: (result: { data: { id: string }; error: null }) => void = () => undefined;
    mocks.single.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    showForm();
    fillDraft();
    const button = screen.getByRole("button", { name: "Save local record" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await act(async () => {
      finish({ data: { id: "synthetic-record-id" }, error: null });
    });
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("shows a load error rather than presenting a missing table as an empty list", async () => {
    mocks.loadError = { message: "unavailable" };
    showForm();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Records could not be loaded"),
    );
    expect(screen.queryByText("No local SVP records yet.")).not.toBeInTheDocument();
  });

  it("allows an agent to open the tracker UI with RLS-scoped records", () => {
    mocks.roles = ["agent"];
    showForm();
    expect(screen.getByRole("heading", { name: "SVP booking workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save local record" })).toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
