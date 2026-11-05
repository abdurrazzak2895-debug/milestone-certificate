import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpReschedulePanel } from "@/components/app/SvpReschedulePanel";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  dates: vi.fn(),
  sessions: vi.fn(),
  reschedule: vi.fn(),
  takamol: vi.fn(),
  sites: vi.fn(),
  slots: vi.fn(),
  siteReschedule: vi.fn(),
}));

vi.mock("@/lib/svp-booking.functions", () => ({
  getSvpReservationDetail: mocks.detail,
  listSvpRescheduleDates: mocks.dates,
  listSvpExamSessions: mocks.sessions,
  rescheduleSvpBooking: mocks.reschedule,
  listSvpPrometricSites: mocks.sites,
  listSvpPrometricSlots: mocks.slots,
  rescheduleSvpSiteBooking: mocks.siteReschedule,
}));

vi.mock("@/lib/takamol-availability.functions", () => ({
  lookupTakamolAvailability: mocks.takamol,
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

function takamolResponse(data: { endpoint: string; city?: string }) {
  switch (data.endpoint) {
    case "cities":
      return { success: true, data: { cities: ["Dhaka"] } };
    case "centers":
      return {
        success: true,
        data: { centers: [{ id: "center-a", name: "Site A", city: data.city ?? "Dhaka" }] },
      };
    case "dates":
      return { success: true, data: { dates: ["2026-12-01"] } };
    case "sessions":
      return {
        success: true,
        data: {
          sessions: [
            {
              id: "takamol-row-1",
              test_center_id: "center-a",
              center_name: "Site A",
              city: data.city ?? "Dhaka",
              exam_date: "2026-12-01",
              exam_time: "10:00 AM",
              status: "Available",
              available_seats: 4,
            },
          ],
        },
      };
    default:
      return { success: false, status: 400, message: "Unknown endpoint" };
  }
}

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
  mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) =>
    Promise.resolve(takamolResponse(data)),
  );
  mocks.sites.mockResolvedValue({
    ok: true,
    data: {
      examId: "555",
      sites: [
        {
          siteId: 9,
          name: "Site A",
          city: "Dhaka",
          address: "1 Test Road",
          dates: ["2026-12-01"],
        },
      ],
    },
  });
  mocks.slots.mockResolvedValue({
    ok: true,
    data: [{ id: "slot-1", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 }],
  });
  mocks.siteReschedule.mockResolvedValue({
    ok: true,
    data: { message: "Appointment rescheduled with SVP." },
  });
});

function renderPanel(props?: {
  canBeRescheduled?: boolean;
  isTargeted?: boolean;
  loadBalancer?: boolean;
  onReconnect?: () => void;
  rescheduleTimes?: number | null;
  onDone?: (
    result: { startAt: string; city: string | null; centerName: string | null } | null,
  ) => void;
}) {
  if (props?.canBeRescheduled === false) {
    mocks.detail.mockResolvedValue({ ok: true, data: { ...detail, canBeRescheduled: false } });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SvpReschedulePanel
        reservationId="987"
        rescheduleTimes={props?.rescheduleTimes === undefined ? 1 : props.rescheduleTimes}
        isTargeted={props?.isTargeted ?? true}
        loadBalancer={props?.loadBalancer ?? false}
        onCancel={vi.fn()}
        onReconnect={props?.onReconnect}
        onDone={props?.onDone ?? vi.fn()}
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
        data: {
          reservationId: "987",
          examSessionId: 777,
          languageCode: "en",
          countryId: 4,
          categoryId: 159,
        },
      }),
    );
    expect(await screen.findByText("Appointment rescheduled")).toBeInTheDocument();
  });

  it("holds every date token and passes the assigned-session inputs in load-balancer mode", async () => {
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
        {
          id: 778,
          startAt: "2026-12-01 11:00:00",
          endAt: null,
          duration: 3600,
          availableSeats: 2,
          city: "Dhaka",
          centerName: "Dhaka Center",
          siteId: null,
        },
      ],
    });
    renderPanel({ loadBalancer: true });

    fireEvent.change(await screen.findByLabelText("New city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Dhaka Center/ }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    await waitFor(() =>
      expect(mocks.reschedule).toHaveBeenCalledWith({
        data: {
          reservationId: "987",
          examSessionId: 777,
          languageCode: "en",
          // The whole day's tokens are held so SVP can assign the real session.
          sessionIds: [777, 778],
          countryId: 4,
          categoryId: 159,
        },
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

  it("reports the appointment SVP stored even when it differs from the picked session", async () => {
    mocks.detail.mockResolvedValueOnce({ ok: true, data: detail }).mockResolvedValue({
      ok: true,
      data: { ...detail, startAt: "2026-12-01 15:00:00", centerName: "Mirpur Center" },
    });
    const onDone = vi.fn();
    renderPanel({ onDone });

    fireEvent.change(await screen.findByLabelText("New city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dhaka Center/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    // The hold assigned a 15:00 session, so the panel must not report the picked 11:00.
    expect(await screen.findByText(/15:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledWith({
      startAt: "2026-12-01 15:00:00",
      city: "Dhaka",
      centerName: "Mirpur Center",
    });
  });

  it("stops before the form when SVP reports no reschedules are left", async () => {
    renderPanel({ rescheduleTimes: 0 });

    expect(
      await screen.findByText(/no reschedules are left for this account/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New city *")).not.toBeInTheDocument();
  });

  it("does not invent a reschedule count when SVP did not answer the constraints call", async () => {
    renderPanel({ rescheduleTimes: null });

    // Unknown quota must not read as "0 reschedule(s) left", and the form stays usable
    // because the server is the source of truth for the gate.
    expect(await screen.findByText(/Current session:/)).toBeInTheDocument();
    expect(screen.queryByText(/reschedule\(s\) left/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm reschedule" })).toBeInTheDocument();
  });

  it("asks the agent to reconnect when SVP reports an expired session", async () => {
    mocks.reschedule.mockResolvedValue({
      ok: false,
      needsSignIn: true,
      message: "The SVP session expired. Sign in again.",
    });
    const onReconnect = vi.fn();
    renderPanel({ onReconnect });

    fireEvent.change(await screen.findByLabelText("New city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dhaka Center/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    // The booking flow opens the login panel for an expired session; reschedule must too.
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Appointment rescheduled")).not.toBeInTheDocument();
  });
});

describe("SVP site-based reschedule", () => {
  it("uses SVP site dates and auto-selects a real slot even when Takamol rows do not match", async () => {
    mocks.sites.mockResolvedValue({
      ok: true,
      data: {
        examId: "555",
        sites: [
          {
            siteId: 9,
            name: "Site A",
            city: "Dhaka",
            address: "1 Test Road",
            dates: ["2026-12-01"],
          },
        ],
      },
    });
    mocks.slots.mockResolvedValue({
      ok: true,
      data: [{ id: "real-svp-slot", siteId: 9, startAt: "2026-12-01T11:30:00", duration: 30 }],
    });
    renderPanel({ isTargeted: false });

    const citySelect = (await screen.findByLabelText("New city *")) as HTMLSelectElement;
    expect(citySelect).toHaveValue("");
    expect(mocks.takamol).toHaveBeenCalledWith({ data: { endpoint: "cities", categoryId: "159" } });
    fireEvent.change(citySelect, { target: { value: "Dhaka" } });
    fireEvent.change(await screen.findByLabelText("Month to check"), {
      target: { value: "2026-12" },
    });
    await waitFor(() =>
      expect(mocks.sites).toHaveBeenLastCalledWith({
        data: {
          prometricCode: "en",
          city: "Dhaka",
          countryId: 4,
          month: "2026-12",
        },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));

    const realSlot = await screen.findByRole("button", { name: /11:30/ });
    expect(realSlot).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirm reschedule" })).toBeEnabled();
    expect(screen.queryByText(/no matching site IDs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no row could be matched uniquely/i)).not.toBeInTheDocument();
  });

  it("surfaces a failed city-list request instead of silently showing only the current city", async () => {
    mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) =>
      Promise.resolve(
        data.endpoint === "cities"
          ? { success: false, status: 502, message: "Takamol city endpoint unavailable" }
          : takamolResponse(data),
      ),
    );
    renderPanel({ isTargeted: false });

    expect(await screen.findByRole("alert")).toHaveTextContent("Takamol city endpoint unavailable");
    expect((await screen.findByLabelText("New city *")) as HTMLSelectElement).toHaveValue("");
    expect(await screen.findByRole("button", { name: "Retry city list" })).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Dhaka (current booking fallback)" }),
    ).toBeInTheDocument();
  });

  it("does not offer SVP reconnect for a Takamol authorization failure", async () => {
    const onReconnect = vi.fn();
    mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) =>
      Promise.resolve(
        data.endpoint === "cities"
          ? { success: false, status: 403, message: "Takamol lookup is not authorized" }
          : takamolResponse(data),
      ),
    );
    renderPanel({ isTargeted: false, onReconnect });

    const citySelect = (await screen.findByLabelText("New city *")) as HTMLSelectElement;
    await waitFor(() => expect(citySelect).toHaveValue(""));
    expect(await screen.findByRole("alert")).toHaveTextContent("Takamol lookup is not authorized");
    expect(
      await screen.findByRole("option", { name: "Dhaka (current booking fallback)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconnect to SVP" })).not.toBeInTheDocument();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("keeps the current booking city as a fallback when Takamol returns an empty city list", async () => {
    mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) =>
      Promise.resolve(
        data.endpoint === "cities"
          ? { success: true, data: { cities: [] } }
          : takamolResponse(data),
      ),
    );
    renderPanel({ isTargeted: false });

    const citySelect = (await screen.findByLabelText("New city *")) as HTMLSelectElement;
    await waitFor(() => expect(citySelect).toHaveValue(""));
    expect(screen.getByText(/Takamol returned no cities for this category/)).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Dhaka (current booking fallback)" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Retry city list" })).toBeInTheDocument();
  });

  it("checks a manually entered city with Takamol after its city-list endpoint fails", async () => {
    mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) =>
      Promise.resolve(
        data.endpoint === "cities"
          ? { success: false, status: 404, message: "Resource not found (HTTP 404)" }
          : takamolResponse(data),
      ),
    );
    renderPanel({ isTargeted: false });

    const citySelect = (await screen.findByLabelText("New city *")) as HTMLSelectElement;
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 404");
    fireEvent.change(citySelect, { target: { value: "__manual_city__" } });
    fireEvent.change(await screen.findByLabelText("Manual city name"), {
      target: { value: "  Chattogram  " },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Check this city" }));

    await waitFor(() => expect(citySelect).toHaveValue("Chattogram"));
    expect(mocks.takamol).toHaveBeenCalledWith({
      data: { endpoint: "centers", city: "Chattogram" },
    });
    await waitFor(() =>
      expect(mocks.sites).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          prometricCode: "en",
          city: "Chattogram",
          countryId: 4,
        }),
      }),
    );
  });

  it("shows available Takamol test centers after date selection and filters slots by center", async () => {
    mocks.slots.mockResolvedValue({
      ok: true,
      data: [
        { id: "slot-1", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 },
        { id: "slot-2", siteId: 9, startAt: "2026-12-01T14:00:00", duration: 30 },
      ],
    });
    renderPanel({ isTargeted: false });

    const citySelect = (await screen.findByLabelText("New city *")) as HTMLSelectElement;
    fireEvent.change(citySelect, { target: { value: "Dhaka" } });
    fireEvent.change(await screen.findByLabelText("Month to check"), {
      target: { value: "2026-12" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));

    // The center catalogue shows up only after a date is chosen.
    expect(await screen.findByText("Available test centers · Tue, 1 Dec 2026")).toBeInTheDocument();
    const centerChip = await screen.findByRole("button", { name: "Show only Site A" });
    expect(
      screen.getByRole("button", { name: "Show all available test centers" }),
    ).toBeInTheDocument();
    expect(centerChip).toHaveTextContent("Site A · Dhaka · 1 available");
    await screen.findByRole("button", { name: /10:00/ });
    expect(screen.getByRole("button", { name: /14:00/ })).toBeInTheDocument();

    // Choosing a center narrows the slot list to that center's availability.
    fireEvent.click(centerChip);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /10:00/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /14:00/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Confirm reschedule" })).toBeEnabled();

    // All centers restores the full slot list.
    fireEvent.click(screen.getByRole("button", { name: "Show all available test centers" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /14:00/ })).toBeInTheDocument();
    });
  });

  it("holds a slot and reschedules with the prometric exam id and site", async () => {
    renderPanel({ isTargeted: false });

    expect(await screen.findByText(/site-based flow/)).toBeInTheDocument();
    const citySelect = await screen.findByLabelText("New city *");
    await waitFor(() => expect((citySelect as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(citySelect, {
      target: { value: "Dhaka" },
    });
    fireEvent.change(await screen.findByLabelText("Month to check"), {
      target: { value: "2026-12" },
    });
    await waitFor(() =>
      expect(mocks.sites).toHaveBeenLastCalledWith({
        data: {
          prometricCode: "en",
          city: "Dhaka",
          countryId: 4,
          month: "2026-12",
        },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    expect(await screen.findByRole("button", { name: /10:00/ })).toBeEnabled();
    const confirmButton = screen.getByRole("button", { name: "Confirm reschedule" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mocks.siteReschedule).toHaveBeenCalledWith({
        data: {
          reservationId: "987",
          examId: "555",
          slotId: "slot-1",
          siteId: 9,
          siteCity: "Dhaka",
          languageCode: "en",
          duration: 30,
          startAt: "2026-12-01T10:00:00",
          categoryId: 159,
          countryId: 4,
        },
      }),
    );
    expect(await screen.findByText("Appointment rescheduled")).toBeInTheDocument();
  });

  it("submits the selected SVP slot ID even when Takamol rows arrive in a different order", async () => {
    mocks.takamol.mockImplementation(({ data }: { data: { endpoint: string; city?: string } }) => {
      if (data.endpoint === "cities") {
        return Promise.resolve({ success: true, data: { cities: ["Dhaka"] } });
      }
      if (data.endpoint === "centers") {
        return Promise.resolve({
          success: true,
          data: {
            centers: [
              { id: "center-a", name: "Site A", city: "Dhaka" },
              { id: "center-b", name: "Site B", city: "Dhaka" },
            ],
          },
        });
      }
      if (data.endpoint === "dates") {
        return Promise.resolve({ success: true, data: { dates: ["2026-12-01"] } });
      }
      return Promise.resolve({
        success: true,
        data: {
          sessions: [
            {
              id: "tak-b",
              test_center_id: "center-b",
              city: "Dhaka",
              exam_date: "2026-12-01",
              exam_time: "11:00 AM",
              status: "Available",
              available_seats: 2,
            },
            {
              id: "tak-a",
              test_center_id: "center-a",
              city: "Dhaka",
              exam_date: "2026-12-01",
              exam_time: "10:00 AM",
              status: "Available",
              available_seats: 3,
            },
          ],
        },
      });
    });
    mocks.sites.mockResolvedValue({
      ok: true,
      data: {
        examId: "555",
        sites: [
          { siteId: 9, name: "Site A", city: "Dhaka", address: "A", dates: ["2026-12-01"] },
          { siteId: 10, name: "Site B", city: "Dhaka", address: "B", dates: ["2026-12-01"] },
        ],
      },
    });
    mocks.slots.mockResolvedValue({
      ok: true,
      data: [
        { id: "slot-a", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 },
        { id: "slot-b", siteId: 10, startAt: "2026-12-01T11:00:00", duration: 45 },
      ],
    });
    renderPanel({ isTargeted: false });

    fireEvent.change(await screen.findByLabelText("New city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.change(await screen.findByLabelText("Month to check"), {
      target: { value: "2026-12" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /11:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    await waitFor(() =>
      expect(mocks.siteReschedule).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slotId: "slot-b",
          siteId: 10,
          startAt: "2026-12-01T11:00:00",
        }),
      }),
    );
  });
});
