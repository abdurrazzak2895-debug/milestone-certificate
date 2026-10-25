import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SvpExamSessionsTable } from "@/components/app/SvpExamSessionsTable";

type TestView = {
  key: string;
  startAt: string;
  endAt?: string | null;
  center: string | null;
  city: string | null;
  seats: number | null;
  duration: number | null;
  durationUnit: "seconds" | "minutes";
  selected: boolean;
  onSelect: () => void;
};

const makeView = (overrides: Partial<TestView> = {}): TestView => ({
  key: "provider-session-opaque-key",
  startAt: "2026-11-05T09:30:00",
  endAt: null,
  center: "Dhaka Technical Training Centre",
  city: "Dhaka",
  seats: 7,
  duration: 3600,
  durationUnit: "seconds",
  selected: false,
  onSelect: vi.fn(),
  ...overrides,
});

function renderTable(
  overrides: Partial<{
    views: TestView[];
    loading: boolean;
    error: string | null;
    loaded: boolean;
    targeted: boolean;
    loadBalancer: boolean;
    onRetry: () => void;
  }> = {},
) {
  return render(
    <SvpExamSessionsTable
      views={overrides.views ?? [makeView()]}
      loading={overrides.loading ?? false}
      error={overrides.error ?? null}
      loaded={overrides.loaded ?? true}
      targeted={overrides.targeted ?? true}
      loadBalancer={overrides.loadBalancer ?? false}
      onRetry={overrides.onRetry ?? vi.fn()}
    />,
  );
}

function dataRows() {
  return screen.getAllByRole("row").slice(1);
}

function rowForCenter(center: string) {
  const row = dataRows().find((candidate) => within(candidate).queryByText(center));
  if (!row) throw new Error(`Could not find a row for ${center}`);
  return row;
}

function cellsFor(row: HTMLElement) {
  return within(row).getAllByRole("cell");
}

afterEach(cleanup);

describe("SvpExamSessionsTable", () => {
  it("renders every session detail row before any selection click", () => {
    renderTable({
      views: [
        makeView({
          key: "opaque-session-a",
          center: "Dhaka Technical Training Centre",
          city: "Dhaka",
        }),
        makeView({
          key: "opaque-session-b",
          center: "Chattogram Assessment Site",
          city: "Chattogram",
          startAt: "2026-11-06T14:15:00",
          seats: 2,
          duration: 90,
          durationUnit: "minutes",
        }),
      ],
    });

    expect(screen.getByRole("columnheader", { name: "Test center" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "City" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Exam date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Exam time" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Seats" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Duration" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Selection" })).toBeInTheDocument();
    expect(dataRows()).toHaveLength(2);
    expect(screen.getByText("Dhaka Technical Training Centre")).toBeInTheDocument();
    expect(screen.getByText("Chattogram Assessment Site")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText("90 min")).toBeInTheDocument();
  });

  it("keeps date-only responses date-only and labels missing provider values", () => {
    renderTable({
      views: [
        makeView({
          key: "date-only-provider-token",
          startAt: "2026-11-07",
          center: null,
          city: "Dhaka",
          seats: null,
          duration: null,
        }),
      ],
    });

    const cells = cellsFor(dataRows()[0]!);
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveTextContent("Not provided by SVP");
    expect(cells[1]).toHaveTextContent("Dhaka");
    expect(cells[2]).toHaveTextContent("2026");
    expect(cells[3]).toHaveTextContent("Not provided by SVP");
    expect(cells[3]).not.toHaveTextContent("00:00");
    expect(cells[4]).toHaveTextContent("Not provided by SVP");
    expect(cells[5]).toHaveTextContent("Not provided by SVP");
    expect(screen.queryByText("date-only-provider-token")).not.toBeInTheDocument();
  });

  it("formats seconds and minutes without turning zero or null durations into fake seconds", () => {
    renderTable({
      views: [
        makeView({ center: "Seconds Centre", duration: 3600, durationUnit: "seconds" }),
        makeView({
          key: "site-duration",
          center: "Site Duration Centre",
          duration: 90,
          durationUnit: "minutes",
        }),
        makeView({
          key: "zero-duration",
          center: "Zero Duration Centre",
          duration: 0,
          durationUnit: "seconds",
        }),
        makeView({
          key: "null-duration",
          center: "Null Duration Centre",
          duration: null,
          durationUnit: "minutes",
        }),
      ],
    });

    expect(cellsFor(rowForCenter("Seconds Centre"))[5]).toHaveTextContent("60 min");
    expect(cellsFor(rowForCenter("Site Duration Centre"))[5]).toHaveTextContent("90 min");
    expect(cellsFor(rowForCenter("Zero Duration Centre"))[5]).toHaveTextContent(
      "Not provided by SVP",
    );
    expect(cellsFor(rowForCenter("Null Duration Centre"))[5]).toHaveTextContent(
      "Not provided by SVP",
    );
    expect(screen.queryByText(/—s/)).not.toBeInTheDocument();
  });

  it("shows the supplied wall-clock time and end time without a browser timezone conversion", () => {
    renderTable({
      views: [
        makeView({
          center: "Wall Clock Centre",
          startAt: "2026-11-05T09:30:00+05:00",
          endAt: "2026-11-05T11:00:00+05:00",
        }),
      ],
    });

    const cells = cellsFor(rowForCenter("Wall Clock Centre"));
    expect(cells[3]).toHaveTextContent("09:30 – 11:00");
    expect(cells[3]).not.toHaveTextContent("04:30");
  });

  it("calls only onSelect when a row is selected and mirrors selected in aria-pressed", () => {
    const onSelect = vi.fn();
    const view = makeView({ center: "Selectable Centre", selected: false, onSelect });
    const { rerender } = renderTable({ views: [view] });
    const row = rowForCenter("Selectable Centre");
    const selection = within(row).getByRole("button", { pressed: false });

    expect(selection).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(selection);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(
      <SvpExamSessionsTable
        views={[{ ...view, selected: true }]}
        loading={false}
        error={null}
        loaded
        targeted
        loadBalancer={false}
        onRetry={vi.fn()}
      />,
    );
    expect(
      within(rowForCenter("Selectable Centre")).getByRole("button", { pressed: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows zero seats as Full and disables selection", () => {
    renderTable({
      views: [
        makeView({
          key: "full-session",
          center: "Full Centre",
          seats: 0,
        }),
      ],
    });

    const row = rowForCenter("Full Centre");
    expect(cellsFor(row)[4]).toHaveTextContent("0");
    expect(cellsFor(row)[4]).toHaveTextContent("Full");
    expect(within(row).getByRole("button", { pressed: false })).toBeDisabled();
  });

  it("uses the load-balancer center placeholder while a seat is not yet assigned", () => {
    renderTable({
      loadBalancer: true,
      views: [
        makeView({
          key: "load-balancer-session",
          center: null,
          city: "Dhaka",
          seats: null,
        }),
      ],
    });

    expect(screen.getByText("Assigned by SVP after seat hold")).toBeInTheDocument();
  });

  it("hides stale rows and buttons while loading", () => {
    renderTable({
      loading: true,
      views: [makeView({ center: "Stale Centre", key: "stale-loading-key" })],
    });

    expect(screen.queryByText("Stale Centre")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an alert and Retry sessions while hiding stale error-state options", () => {
    const onRetry = vi.fn();
    renderTable({
      error: "SVP sessions could not be loaded.",
      views: [makeView({ center: "Stale Error Centre", key: "stale-error-key" })],
      onRetry,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("SVP sessions could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry sessions" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Stale Error Centre")).not.toBeInTheDocument();
    expect(screen.queryByText("stale-error-key")).not.toBeInTheDocument();
  });

  it("shows an empty success state without session or slot buttons", () => {
    renderTable({ loaded: true, views: [] });

    expect(screen.getByText(/No (sessions|slots)/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
