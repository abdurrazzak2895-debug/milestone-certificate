import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpBookingWizard } from "@/components/app/SvpBookingWizard";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  occupations: vi.fn(),
  search: vi.fn(),
  cities: vi.fn(),
  setup: vi.fn(),
  overview: vi.fn(),
  sites: vi.fn(),
  slots: vi.fn(),
  hold: vi.fn(),
  targetedHold: vi.fn(),
  dates: vi.fn(),
  sessions: vi.fn(),
  reservations: vi.fn(),
  eligibility: vi.fn(),
  create: vi.fn(),
  ticket: vi.fn(),
  insert: vi.fn(),
  signOut: vi.fn(),
  accounts: vi.fn(),
  switchAccount: vi.fn(),
  removeAccount: vi.fn(),
}));

vi.mock("@/lib/svp-session.functions", () => ({
  getSvpSessionStatus: mocks.status,
  signOutSvpSession: mocks.signOut,
  listSvpAccounts: mocks.accounts,
  switchSvpAccount: mocks.switchAccount,
  removeSvpAccount: mocks.removeAccount,
  submitSvpLogin: vi.fn(),
}));

vi.mock("@/lib/svp-booking.functions", () => ({
  listSvpBookingOccupations: mocks.occupations,
  searchSvpOccupations: mocks.search,
  listSvpTestCenterCities: mocks.cities,
  getSvpBookingSetup: mocks.setup,
  getSvpAccountOverview: mocks.overview,
  listSvpPrometricSites: mocks.sites,
  listSvpPrometricSlots: mocks.slots,
  createSvpPrometricHold: mocks.hold,
  createSvpTargetedHold: mocks.targetedHold,
  listSvpAvailableDates: mocks.dates,
  listSvpExamSessions: mocks.sessions,
  listSvpReservations: mocks.reservations,
  checkSvpBookingEligibility: mocks.eligibility,
  createSvpBooking: mocks.create,
  downloadSvpTicket: mocks.ticket,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.insert }) },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/app/SvpLoginPanel", () => ({
  SvpLoginPanel: () => <div>SVPLOGINPANEL</div>,
}));

const occupation = {
  id: 11,
  name: "Welder",
  arabicName: null,
  occupationKey: "721201",
  categoryId: 159,
  categoryName: "Welding",
  languages: [{ code: "en", label: "English", questionCount: 30 }],
  driverLicenseRequired: false,
};

const session = {
  id: 501,
  startAt: "2026-11-05 09:30:00",
  endAt: null,
  duration: 3600,
  availableSeats: 7,
  city: "Dhaka",
  centerName: "Dhaka Center",
  siteId: null,
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({
    signedIn: true,
    userName: "Noor Rahman",
    login: "noor@example.com",
    expiresAt: 1_900_000_000,
  });
  mocks.occupations.mockResolvedValue({ ok: true, data: [occupation] });
  mocks.search.mockResolvedValue({ ok: true, data: [occupation] });
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
  mocks.hold.mockResolvedValue({ ok: true, data: { holdId: "hold-1", expiresAt: null } });
  mocks.targetedHold.mockResolvedValue({
    ok: true,
    data: { expiresAt: "2026-11-05T09:40:00.000Z" },
  });
  mocks.cities.mockResolvedValue({ ok: true, data: [{ city: "Dhaka", countryId: 4 }] });
  mocks.setup.mockResolvedValue({
    ok: true,
    data: {
      permissions: {
        freeReservations: true,
        targeted: true,
        countryId: 4,
        countryName: "Bangladesh",
      },
      credits: 0,
      svpUserId: "969955",
    },
  });
  mocks.overview.mockResolvedValue({
    ok: true,
    data: {
      permissions: {
        freeReservations: true,
        targeted: true,
        countryId: 4,
        countryName: "Bangladesh",
        permissionKeys: ["book_appointment", "reschedule_appointment"],
      },
      constraints: { rescheduleTimes: 1, bookingHoldSeconds: 600, cancellationLimitHours: 48 },
      flags: { rescheduleEnabled: true, creditsEnabled: true },
      credits: 0,
    },
  });
  mocks.dates.mockResolvedValue({
    ok: true,
    data: [{ startAt: "2026-11-05 09:30:00", city: "Dhaka", centerName: "Dhaka Center" }],
  });
  mocks.sessions.mockResolvedValue({ ok: true, data: [session] });
  mocks.reservations.mockResolvedValue({ ok: true, data: [] });
  mocks.eligibility.mockResolvedValue({
    ok: true,
    data: [
      {
        key: "passport_expiration_condition",
        label: "Passport validity",
        passed: true,
        message: "Passed",
      },
      {
        key: "booking_availability_condition",
        label: "Booking availability",
        passed: true,
        message: "Passed",
      },
      {
        key: "already_existing_booking",
        label: "Existing booking check",
        passed: true,
        message: "Passed",
      },
    ],
  });
  mocks.create.mockResolvedValue({
    ok: true,
    data: {
      reservationId: "R-123",
      paid: true,
      paymentRequired: false,
      credits: 0,
      message: "Reservation confirmed by SVP.",
    },
  });
  mocks.ticket.mockResolvedValue({
    ok: true,
    data: { base64: globalThis.btoa("%PDF-1.4 ticket"), contentType: "application/pdf" },
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ ok: true });
  mocks.accounts.mockResolvedValue({
    accounts: [
      {
        login: "noor@example.com",
        userName: "Noor Rahman",
        expiresAt: 1_900_000_000,
        active: true,
      },
    ],
    activeLogin: "noor@example.com",
  });
  mocks.switchAccount.mockResolvedValue({
    accounts: [
      {
        login: "noor@example.com",
        userName: "Noor Rahman",
        expiresAt: 1_900_000_000,
        active: true,
      },
    ],
    activeLogin: "noor@example.com",
  });
  mocks.removeAccount.mockResolvedValue({ accounts: [], activeLogin: null });
});

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SvpBookingWizard />
    </QueryClientProvider>,
  );
}

describe("SVP booking wizard", () => {
  it("shows the SVP login panel when there is no stored session", async () => {
    mocks.status.mockResolvedValue({
      signedIn: false,
      userName: null,
      login: null,
      expiresAt: 0,
    });
    renderWizard();

    expect(await screen.findByText("SVPLOGINPANEL")).toBeInTheDocument();
  });

  it("books a session end to end and saves the local record", async () => {
    renderWizard();

    expect(await screen.findByText(/Signed in to SVP as Noor Rahman/)).toBeInTheDocument();

    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    fireEvent.change(screen.getByLabelText("Test center city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check eligibility" }));

    expect(await screen.findByText(/Step 2/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /5 Nov 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dhaka Center/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.targetedHold).toHaveBeenCalledWith({
        data: { examSessionId: 501, categoryId: 159, countryId: 4 },
      }),
    );
    expect(await screen.findByText(/Step 3/)).toBeInTheDocument();
    expect(await screen.findByText(/Seat held by SVP until/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Candidate name *"), {
      target: { value: "Noor Rahman" },
    });
    fireEvent.change(screen.getByLabelText("Passport *"), { target: { value: "AB123456" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create SVP booking" }));

    expect(await screen.findByText(/SVP reservation number: R-123/)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        data: {
          occupationId: 11,
          categoryId: 159,
          examSessionId: 501,
          holdId: null,
          languageCode: "en",
          duration: 3600,
          startAt: "2026-11-05 09:30:00",
          siteId: null,
          siteCity: null,
          countryId: 4,
        },
      }),
    );
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate_name: "NOOR RAHMAN",
        passport: "AB123456",
        reference_no: "R-123",
        status: "booked",
      }),
    );
  });

  it("blocks the flow when an SVP eligibility check fails", async () => {
    mocks.eligibility.mockResolvedValue({
      ok: true,
      data: [
        {
          key: "already_existing_booking",
          label: "Existing booking check",
          passed: false,
          message: "An existing reservation already uses this category.",
        },
      ],
    });
    renderWizard();

    await screen.findByText(/Signed in to SVP as Noor Rahman/);
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    fireEvent.change(screen.getByLabelText("Test center city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check eligibility" }));

    expect(
      await screen.findByText(/An existing reservation already uses this category/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Step 2/)).not.toBeInTheDocument();
  });
});

describe("occupation auto-suggest", () => {
  it("searches SVP for similar occupations while typing", async () => {
    mocks.occupations.mockResolvedValue({
      ok: true,
      data: [{ ...occupation, id: 99, name: "Plumber", occupationKey: "713601" }],
    });
    mocks.search.mockResolvedValue({
      ok: true,
      data: [
        {
          ...occupation,
          id: 77,
          name: "Loading and Unloading Worker",
          occupationKey: "933301",
        },
      ],
    });

    renderWizard();
    const input = await screen.findByLabelText("Occupation *");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "load" } });

    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith({ data: { query: "load" } }), {
      timeout: 3000,
    });
    const suggestion = await screen.findByRole("button", {
      name: /Loading and Unloading Worker/,
    });
    fireEvent.click(suggestion);

    expect(screen.getByText(/Selected: Loading and Unloading Worker/)).toBeInTheDocument();
  });
});

describe("SVP multi-account vault UI", () => {
  it("switches the active SVP account from the account selector", async () => {
    mocks.accounts.mockResolvedValue({
      accounts: [
        {
          login: "noor@example.com",
          userName: "Noor Rahman",
          expiresAt: 1_900_000_000,
          active: true,
        },
        {
          login: "other@example.com",
          userName: "Other Labor",
          expiresAt: 1_900_000_000,
          active: false,
        },
      ],
      activeLogin: "noor@example.com",
    });

    renderWizard();
    const select = await screen.findByLabelText("Active SVP account");
    fireEvent.change(select, { target: { value: "other@example.com" } });

    await waitFor(() =>
      expect(mocks.switchAccount).toHaveBeenCalledWith({ data: { login: "other@example.com" } }),
    );
  });

  it("opens the login panel to add another account without losing the active one", async () => {
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: "Add account" }));

    expect(await screen.findByText("SVPLOGINPANEL")).toBeInTheDocument();
    expect(screen.getByText("Add another SVP account")).toBeInTheDocument();
  });
});

describe("site-based booking flow", () => {
  it("holds a slot and creates the reservation with the prometric exam id and hold", async () => {
    mocks.overview.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: true,
          targeted: false,
          countryId: 4,
          countryName: "Bangladesh",
          permissionKeys: ["book_appointment"],
        },
        constraints: { rescheduleTimes: 1, bookingHoldSeconds: 600, cancellationLimitHours: 48 },
        flags: { rescheduleEnabled: true, creditsEnabled: true },
        credits: 0,
      },
    });
    mocks.setup.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: true,
          targeted: false,
          countryId: 4,
          countryName: "Bangladesh",
        },
        credits: 0,
        svpUserId: "969955",
      },
    });

    renderWizard();

    await screen.findByText(/Signed in to SVP as Noor Rahman/);
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    fireEvent.change(screen.getByLabelText("Test center city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check eligibility" }));

    expect(await screen.findByText(/Step 2/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /1 Dec 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Site A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.hold).toHaveBeenCalledWith({
        data: { slotId: "slot-1", siteId: 9 },
      }),
    );
    expect(await screen.findByText(/Step 3/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Candidate name *"), {
      target: { value: "Noor Rahman" },
    });
    fireEvent.change(screen.getByLabelText("Passport *"), { target: { value: "AB123456" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create SVP booking" }));

    expect(await screen.findByText(/SVP reservation number: R-123/)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        data: {
          occupationId: 11,
          categoryId: 159,
          examSessionId: "555",
          holdId: "hold-1",
          languageCode: "en",
          duration: 30,
          startAt: "2026-12-01T10:00:00",
          siteId: 9,
          siteCity: "Dhaka",
          countryId: 4,
        },
      }),
    );
  });
});

describe("SVP ticket download", () => {
  it("saves the PDF as Candidate_Occupation_SVP_Ticket.pdf", async () => {
    mocks.reservations.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "987",
          status: "reserved",
          laborName: "Noor Rahman",
          occupationName: "Welder",
          occupationEnglishName: "Welder",
          city: "Dhaka",
          centerName: "Dhaka Center",
          startAt: "2026-11-05 09:30:00",
          methodology: null,
        },
      ],
    });

    let downloadedName = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:svp-ticket"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: "Ticket PDF" }));

    await waitFor(() =>
      expect(mocks.ticket).toHaveBeenCalledWith({ data: { reservationId: "987" } }),
    );
    expect(downloadedName).toBe("Noor_Rahman_Welder_SVP_Ticket.pdf");
    clickSpy.mockRestore();
  });
});

describe("temporary seat hold", () => {
  it("does not move to confirmation when SVP rejects the seat hold", async () => {
    mocks.targetedHold.mockResolvedValue({
      ok: false,
      needsSignIn: false,
      message: "SVP could not hold this seat.",
    });

    renderWizard();
    await screen.findByText(/Signed in to SVP as Noor Rahman/);
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    fireEvent.change(screen.getByLabelText("Test center city *"), {
      target: { value: "Dhaka" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check eligibility" }));
    await screen.findByText(/Step 2/);
    fireEvent.click(await screen.findByRole("button", { name: /5 Nov 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dhaka Center/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(mocks.targetedHold).toHaveBeenCalled());
    expect(screen.queryByText(/Step 3/)).not.toBeInTheDocument();
  });
});
