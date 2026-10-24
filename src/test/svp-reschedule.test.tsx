import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpReschedulePanel } from "@/components/app/SvpReschedulePanel";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  dates: vi.fn(),
  sessions: vi.fn(),
  reschedule: vi.fn(),
}));

vi.mock("@/lib/svp-booking.functions", () => ({
  getSvpReservationDetail: mocks.detail,
  listSvpRescheduleDates: mocks.dates,
  listSvpExamSessions: mocks.sessions,
  rescheduleSvpBooking: mocks.reschedule,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const detail = {
  id: "987",
  status: "reserved",
  laborName: "Noor Rahman",
  occupationName: "Welder",
  occupationEnglishName: "Welder",
  city: "Dhaka",
  centerName: "Dhaka Center",
  startAt: "2026-11-05 09:30:00",
  methodology: "in_person",
  canBeRescheduled: true,
  categoryId: 159,
  examSessionId: 501,
  duration: 3600,
  occupationId: 11,
  categoryName: "Welding",
  languages: [{ code: "en", label: "English", questionCount: 30 }],
  countryId: 4,
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue({ ok: true, data: detail });
  mocks.dates.mockResolvedValue({
    ok: true,
    data: [{ startAt: "2026-12-01 11:00:00", city: "Dhaka", centerName: "Dhaka Center" }],
  });
  mocks.sessions.mockResolvedValue({
    ok: true,
    data: [
      {
        id: 777,
        startAt: "2026-12-01 11:00:00",
        endAt: null,
        duration: 3600,
        availableSeats: 4,
        city: "Dhaka",
        centerName: "Dhaka Center",
        siteId: null,
      },
    ],
  });
  mocks.reschedule.mockResolvedValue({
    ok: true,
    data: { message: "Appointment rescheduled with SVP." },
  });
});

function renderPanel(props?: { canBeRescheduled?: boolean }) {
  if (props?.canBeRescheduled === false) {
    mocks.detail.mockResolvedValue({ ok: true, data: { ...detail, canBeRescheduled: false } });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SvpReschedulePanel
        reservationId="987"
        rescheduleTimes={1}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("SVP reschedule panel", () => {
  it("reschedules through the real SVP endpoint with the chosen session and language", async () => {
    renderPanel();

    expect(await screen.findByText(/Current session:/)).toBeInTheDocument();
    expect(await screen.findByText(/1 reschedule\(s\) left/)).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("New city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dhaka Center/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    await waitFor(() =>
      expect(mocks.reschedule).toHaveBeenCalledWith({
        data: { reservationId: "987", examSessionId: 777, languageCode: "en" },
      }),
    );
    expect(await screen.findByText("Appointment rescheduled")).toBeInTheDocument();
  });

  it("blocks rescheduling when SVP marks the reservation as not reschedulable", async () => {
    renderPanel({ canBeRescheduled: false });

    expect(
      await screen.findByText(/SVP does not allow rescheduling this reservation/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm reschedule" })).not.toBeInTheDocument();
  });
});
