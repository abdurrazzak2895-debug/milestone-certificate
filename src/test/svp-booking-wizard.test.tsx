import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpBookingWizard } from "@/components/app/SvpBookingWizard";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  occupations: vi.fn(),
  search: vi.fn(),
  occupationById: vi.fn(),
  reservationDetail: vi.fn(),
  cities: vi.fn(),
  setup: vi.fn(),
  overview: vi.fn(),
  sites: vi.fn(),
  slots: vi.fn(),
  hold: vi.fn(),
  targetedHold: vi.fn(),
  sessionById: vi.fn(),
  dates: vi.fn(),
  sessions: vi.fn(),
  reservations: vi.fn(),
  eligibility: vi.fn(),
  create: vi.fn(),
  takamol: vi.fn(),
  ticket: vi.fn(),
  insert: vi.fn(),
  signOut: vi.fn(),
  accounts: vi.fn(),
  switchAccount: vi.fn(),
  removeAccount: vi.fn(),
  payments: vi.fn(),
  notifications: vi.fn(),
  cancel: vi.fn(),
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
  getSvpOccupationById: mocks.occupationById,
  getSvpReservationDetail: mocks.reservationDetail,
  listSvpTestCenterCities: mocks.cities,
  getSvpBookingSetup: mocks.setup,
  getSvpAccountOverview: mocks.overview,
  listSvpPrometricSites: mocks.sites,
  listSvpPrometricSlots: mocks.slots,
  createSvpPrometricHold: mocks.hold,
  createSvpTargetedHold: mocks.targetedHold,
  getSvpExamSessionById: mocks.sessionById,
  listSvpAvailableDates: mocks.dates,
  listSvpExamSessions: mocks.sessions,
  listSvpReservations: mocks.reservations,
  checkSvpBookingEligibility: mocks.eligibility,
  createSvpBooking: mocks.create,
  downloadSvpTicket: mocks.ticket,
  listSvpPayments: mocks.payments,
  listSvpNotifications: mocks.notifications,
  cancelSvpReservation: mocks.cancel,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.insert }) },
}));

vi.mock("@/lib/takamol-availability.functions", () => ({
  lookupTakamolAvailability: mocks.takamol,
}));

vi.mock("@/lib/svp-local-record", () => ({
  saveSvpLocalBookingRecord: (_client: unknown, payload: unknown) => mocks.insert(payload),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no tab support; tests that need a payment tab provide a fake window.
  vi.spyOn(window, "open").mockImplementation(() => null);
  mocks.status.mockResolvedValue({
    signedIn: true,
    userName: "Noor Rahman",
    userPassport: "AB123456",
    login: "noor@example.com",
    expiresAt: 1_900_000_000,
  });
  mocks.occupations.mockResolvedValue({ ok: true, data: [occupation] });
  mocks.search.mockResolvedValue({ ok: true, data: [occupation] });
  mocks.occupationById.mockResolvedValue({ ok: true, data: occupation });
  mocks.reservationDetail.mockResolvedValue({
    ok: false,
    needsSignIn: false,
    message: "not loaded in tests",
  });
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
    data: { expiresAt: "2026-11-05T09:40:00.000Z", examSessionId: null },
  });
  mocks.sessionById.mockResolvedValue({ ok: true, data: session });
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
  mocks.payments.mockResolvedValue({ ok: true, data: [] });
  mocks.notifications.mockResolvedValue({ ok: true, data: [] });
  mocks.cancel.mockResolvedValue({
    ok: true,
    data: { reservationId: "R-123", message: "Reservation cancelled in SVP." },
  });
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
  mocks.takamol.mockResolvedValue({ success: false, data: [] });
  mocks.ticket.mockResolvedValue({
    ok: true,
    data: { base64: globalThis.btoa("%PDF-1.4 ticket"), contentType: "application/pdf" },
  });
  mocks.insert.mockResolvedValue("local-record-1");
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

/** Dates live behind a click-to-open calendar now. */
async function pickDate(label: string) {
  const matcher = new RegExp(label);
  const trigger = await screen.findByRole("button", { name: "Exam date" });
  await waitFor(() => expect(trigger).not.toBeDisabled());

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!screen.queryByRole("button", { name: matcher })) fireEvent.click(trigger);
    const option = await screen
      .findByRole("button", { name: matcher }, { timeout: 1500 })
      .catch(() => null);
    if (option) {
      fireEvent.click(option);
      return;
    }
  }
  throw new Error(`Date option not found: ${label}`);
}

/** The date click resolves the test center automatically, so wait for Continue to enable. */
async function clickContinue() {
  const button = screen.getByRole("button", { name: "Continue" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

/** The exam language is a manual choice now, so every flow picks one first. */
function pickLanguage(label = "English") {
  const select = screen.getByLabelText("Exam language *") as HTMLSelectElement;
  const option =
    Array.from(select.options).find((entry) => entry.textContent?.trim() === label) ??
    Array.from(select.options).find((entry) => entry.value);
  if (option) fireEvent.change(select, { target: { value: option.value } });
}

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SvpBookingWizard />
    </QueryClientProvider>,
  );
}

function configureSiteMode() {
  mocks.status.mockResolvedValue({
    signedIn: true,
    userName: "Noor Rahman",
    userPassport: "AB123456",
    login: "noor@example.com",
    expiresAt: 1_900_000_000,
    countryTargeted: false,
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
}

function configureTargetedMode() {
  mocks.status.mockResolvedValue({
    signedIn: true,
    userName: "Noor Rahman",
    userPassport: "AB123456",
    login: "noor@example.com",
    expiresAt: 1_900_000_000,
    countryTargeted: true,
  });
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
        permissionKeys: ["book_appointment"],
      },
      constraints: { rescheduleTimes: 1, bookingHoldSeconds: 600, cancellationLimitHours: 48 },
      flags: { rescheduleEnabled: true, creditsEnabled: true },
      credits: 0,
    },
  });
}

async function openDatesStep() {
  await screen.findByText(/Signed in to SVP as Noor Rahman/);
  fireEvent.focus(await screen.findByLabelText("Occupation *"));
  fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
  pickLanguage();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText(/Step 2/);
}

describe("SVP booking wizard", () => {
  it("shows the resolved test center details before any hold", async () => {
    mocks.sessions.mockResolvedValue({
      ok: true,
      data: [
        { ...session, endAt: "2026-11-05 10:30:00" },
        {
          ...session,
          id: 502,
          startAt: "2026-11-05 13:00:00",
          centerName: "Second Dhaka Center",
          availableSeats: 12,
        },
      ],
    });
    renderWizard();
    await openDatesStep();
    await pickDate("5 Nov 2026");
    // The date click resolves the test center directly; no session list or placeholder table.
    expect(await screen.findByRole("option", { name: /Second Dhaka Center/ })).toBeInTheDocument();
    expect(screen.queryByText(/SVP sessions for this date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not provided by SVP/)).not.toBeInTheDocument();
    const centerPicker = await screen.findByLabelText("Test center");
    expect(centerPicker).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    expect(mocks.targetedHold).not.toHaveBeenCalled();
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

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
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/Step 2/)).toBeInTheDocument();
    await pickDate("5 Nov 2026");
    await clickContinue();

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
          methodology: "in_person",
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
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

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

describe("occupation category enrichment", () => {
  it("loads the full occupation when a search result has no category", async () => {
    mocks.occupations.mockResolvedValue({ ok: true, data: [] });
    mocks.search.mockResolvedValue({
      ok: true,
      data: [
        {
          ...occupation,
          id: 77,
          name: "Load and Unload Worker",
          occupationKey: "933301",
          categoryId: null,
          categoryName: null,
        },
      ],
    });
    mocks.occupationById.mockResolvedValue({
      ok: true,
      data: {
        ...occupation,
        id: 77,
        name: "Load and Unload Worker",
        occupationKey: "933301",
        categoryId: 159,
        categoryName: "Loading",
      },
    });

    renderWizard();
    const input = await screen.findByLabelText("Occupation *");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "load" } });
    fireEvent.click(await screen.findByRole("button", { name: /Load and Unload Worker/ }));

    await waitFor(() =>
      expect(mocks.occupationById).toHaveBeenCalledWith({
        data: { occupationId: 77, name: "Load and Unload Worker" },
      }),
    );
    expect(await screen.findByText(/Selected: Load and Unload Worker/)).toBeInTheDocument();
    expect(screen.getByText(/category 159/)).toBeInTheDocument();
    pickLanguage();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("SVP category auto-match", () => {
  it("matches a missing category from the occupation name", async () => {
    mocks.overview.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: false,
          targeted: true,
          loadBalancer: false,
          countryId: 4,
          countryName: "Bangladesh",
          permissionKeys: [],
        },
        categories: [{ id: 159, name: "Load and unload workers", arabicName: null }],
        constraints: { rescheduleTimes: 1, bookingHoldSeconds: 20, cancellationLimitHours: 72 },
        flags: { rescheduleEnabled: true, creditsEnabled: true },
        credits: 0,
      },
    });
    mocks.occupations.mockResolvedValue({ ok: true, data: [] });
    mocks.search.mockResolvedValue({
      ok: true,
      data: [
        {
          ...occupation,
          id: 77,
          name: "Load and Unload Worker",
          occupationKey: "933301",
          categoryId: null,
          categoryName: null,
        },
      ],
    });
    mocks.occupationById.mockResolvedValue({
      ok: false,
      needsSignIn: false,
      message: "not found",
    });

    renderWizard();
    const input = await screen.findByLabelText("Occupation *");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "load" } });
    fireEvent.click(await screen.findByRole("button", { name: /Load and Unload Worker/ }));

    await waitFor(() => expect(mocks.occupationById).toHaveBeenCalled());
    expect(await screen.findByText(/Auto-matched to/)).toBeInTheDocument();
    pickLanguage();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("SVP city dropdowns", () => {
  it("auto-selects a sole site city and passes its catalogue country id to availability", async () => {
    configureSiteMode();
    mocks.cities.mockResolvedValue({ ok: true, data: [{ city: "Dhaka", countryId: 77 }] });
    mocks.sites.mockResolvedValue({
      ok: true,
      data: {
        examId: "555",
        sites: [
          {
            siteId: 9,
            name: "Dhaka Site",
            city: "Dhaka",
            address: "1 Test Road",
            dates: ["2026-12-01"],
          },
        ],
      },
    });

    renderWizard();
    await openDatesStep();

    const citySelect = await screen.findByLabelText("Test center city *");
    expect(citySelect).toHaveValue("Dhaka");
    await waitFor(() =>
      expect(mocks.sites).toHaveBeenCalledWith({
        data: { prometricCode: "en", city: "Dhaka", countryId: 77 },
      }),
    );
  });

  it("keeps several site cities blank until selected and resets the date/session cascade on change", async () => {
    configureSiteMode();
    mocks.cities.mockResolvedValue({
      ok: true,
      data: [
        { city: "Dhaka", countryId: 77 },
        { city: "Rajshahi", countryId: 88 },
      ],
    });
    mocks.sites.mockResolvedValue({
      ok: true,
      data: {
        examId: "555",
        sites: [
          {
            siteId: 19,
            name: "Rajshahi Site",
            city: "Rajshahi",
            address: "2 Test Road",
            dates: ["2026-12-02"],
          },
        ],
      },
    });
    mocks.slots.mockResolvedValue({
      ok: true,
      data: [{ id: "slot-raj", siteId: 19, startAt: "2026-12-02T10:00:00", duration: 30 }],
    });

    renderWizard();
    await openDatesStep();

    const citySelect = await screen.findByLabelText("Test center city *");
    expect(citySelect).toHaveValue("");
    fireEvent.change(citySelect, { target: { value: "Rajshahi" } });
    await waitFor(() =>
      expect(mocks.sites).toHaveBeenCalledWith({
        data: { prometricCode: "en", city: "Rajshahi", countryId: 88 },
      }),
    );

    await pickDate("2 Dec 2026");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());

    fireEvent.change(citySelect, { target: { value: "Dhaka" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled());
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("filters targeted dates by city before deduplication and only looks up sessions for that city", async () => {
    configureTargetedMode();
    mocks.dates.mockResolvedValue({
      ok: true,
      data: [
        { startAt: "2026-11-05 09:30:00", city: "Rajshahi", centerName: "Rajshahi Center" },
        { startAt: "2026-11-05 10:30:00", city: "Dhaka", centerName: "Dhaka Center" },
        { startAt: "2026-11-07 09:30:00", city: "Rajshahi", centerName: "Rajshahi Center" },
      ],
    });
    mocks.sessions.mockResolvedValue({
      ok: true,
      data: [{ ...session, city: "Dhaka", centerName: "Dhaka Center" }],
    });

    renderWizard();
    await openDatesStep();

    const citySelect = await screen.findByLabelText("Test center city");
    expect(citySelect).toHaveValue("");
    fireEvent.change(citySelect, { target: { value: "Dhaka" } });
    fireEvent.click(await screen.findByRole("button", { name: "Exam date" }));
    expect(await screen.findByRole("button", { name: /5 Nov 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /7 Nov 2026/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /5 Nov 2026/ }));
    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith({
        data: { categoryId: 159, city: "Dhaka", examDate: "2026-11-05" },
      }),
    );
    expect(mocks.targetedHold).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses available-date cities when the site city catalogue errors", async () => {
    configureSiteMode();
    mocks.cities.mockResolvedValue({
      ok: false,
      needsSignIn: false,
      message: "City catalogue unavailable",
    });
    mocks.dates.mockResolvedValue({
      ok: true,
      data: [
        { startAt: "2026-12-01", city: "Dhaka", centerName: "Dhaka Center" },
        { startAt: "2026-12-02", city: "Rajshahi", centerName: "Rajshahi Center" },
      ],
    });

    renderWizard();
    await openDatesStep();

    const citySelect = await screen.findByLabelText("Test center city *");
    expect(citySelect).toHaveValue("");
    expect(screen.getByRole("option", { name: "Dhaka" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Rajshahi" })).toBeInTheDocument();
    // The catalogue error is not surfaced in the UI.
    expect(screen.queryByText("The SVP city catalogue is unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry cities" })).not.toBeInTheDocument();
    expect(mocks.cities).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled city dropdown beside a manual fallback only when no city data exists", async () => {
    configureTargetedMode();
    mocks.dates.mockResolvedValue({ ok: true, data: [] });

    renderWizard();
    await openDatesStep();

    expect(await screen.findByLabelText("Test center city")).toBeDisabled();
    expect(
      await screen.findByText("City (manual fallback)", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter a known SVP test center city")).toBeEnabled();
    expect(screen.queryByRole("option", { name: "Dhaka" })).not.toBeInTheDocument();
  });

  it("shows the site-city loading state while the catalogue request is pending", async () => {
    configureSiteMode();
    let resolveCities!: (value: { ok: true; data: { city: string; countryId: number }[] }) => void;
    mocks.cities.mockResolvedValue(
      new Promise((resolve) => {
        resolveCities = resolve;
      }),
    );

    renderWizard();
    await openDatesStep();
    expect(
      screen
        .getAllByRole("status")
        .some((status) => /Loading cities from SVP/i.test(status.textContent ?? "")),
    ).toBe(true);

    resolveCities({ ok: true, data: [{ city: "Dhaka", countryId: 77 }] });
    expect(await screen.findByLabelText("Test center city *")).toHaveValue("Dhaka");
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
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/Step 2/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Test center city *"), {
      target: { value: "Dhaka" },
    });
    await pickDate("1 Dec 2026");
    await clickContinue();

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
          methodology: "in_person",
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

describe("load-balancer targeted booking", () => {
  it("holds all date tokens and books the session SVP assigns", async () => {
    mocks.overview.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: false,
          targeted: true,
          loadBalancer: true,
          countryId: 4,
          countryName: "Bangladesh",
          permissionKeys: [],
        },
        constraints: { rescheduleTimes: 1, bookingHoldSeconds: 20, cancellationLimitHours: 72 },
        flags: { rescheduleEnabled: true, creditsEnabled: true },
        credits: 0,
      },
    });
    mocks.setup.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: false,
          targeted: true,
          loadBalancer: true,
          countryId: 4,
          countryName: "Bangladesh",
        },
        credits: 0,
        svpUserId: "1337578",
      },
    });
    mocks.sessions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "token-1",
          startAt: "2026-11-05",
          endAt: null,
          duration: 0,
          availableSeats: null,
          city: "Dhaka",
          centerName: null,
          siteId: null,
        },
        {
          id: "token-2",
          startAt: "2026-11-05",
          endAt: null,
          duration: 0,
          availableSeats: null,
          city: "Dhaka",
          centerName: null,
          siteId: null,
        },
      ],
    });
    mocks.targetedHold.mockResolvedValue({
      ok: true,
      data: { expiresAt: "2026-11-05T09:45:00.000Z", examSessionId: "assigned-1" },
    });
    mocks.sessionById.mockResolvedValue({
      ok: true,
      data: {
        id: "assigned-1",
        startAt: "2026-11-05 09:30:00",
        endAt: "2026-11-05 11:30:00",
        duration: 7200,
        availableSeats: null,
        city: "Dhaka",
        centerName: "Dhaka Technical Training Centre",
        siteId: null,
      },
    });

    renderWizard();
    await screen.findByText(/Signed in to SVP as Noor Rahman/);
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Step 2/);
    await pickDate("5 Nov 2026");
    // The date click shows the test center directly instead of an SVP session list.
    expect(await screen.findByText("Test center")).toBeInTheDocument();
    expect(screen.queryByText(/SVP sessions for this date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session 1/)).not.toBeInTheDocument();
    // Load-balancer tokens are date-only: the first token is preselected, all are held.
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await clickContinue();

    await waitFor(() =>
      expect(mocks.targetedHold).toHaveBeenCalledWith({
        data: { examSessionId: ["token-1", "token-2"], categoryId: 159, countryId: 4 },
      }),
    );
    await waitFor(() =>
      expect(mocks.sessionById).toHaveBeenCalledWith({ data: { examSessionId: "assigned-1" } }),
    );
    expect(await screen.findByText(/Step 3/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Candidate name *"), {
      target: { value: "Md Farid" },
    });
    fireEvent.change(screen.getByLabelText("Passport *"), { target: { value: "AB123456" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create SVP booking" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        data: {
          occupationId: 11,
          categoryId: 159,
          examSessionId: "assigned-1",
          holdId: null,
          languageCode: "en",
          methodology: "in_person",
          duration: 7200,
          startAt: "2026-11-05 09:30:00",
          siteId: null,
          siteCity: null,
          countryId: 4,
        },
      }),
    );
  });
});

describe("Takamol availability selection", () => {
  it("selects the real SVP session when a Takamol row is clicked", async () => {
    mocks.takamol.mockResolvedValue({
      success: true,
      data: {
        sessions: [
          {
            id: "avail-1",
            center_name: "Khulna Technical Training Centre",
            exam_time: "2:00 PM",
            seats: 5,
            exam_slot: "Available",
            language_name: "Bengali",
          },
        ],
      },
    });

    renderWizard();
    await screen.findByText(/Signed in to SVP as Noor Rahman/);
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Step 2/);
    // City first (choosing a city resets the date), then the date.
    const citySelect = await screen.findByLabelText("Test center city");
    await waitFor(() => expect(citySelect).not.toBeDisabled());
    fireEvent.change(citySelect, { target: { value: "Dhaka" } });
    await pickDate("5 Nov 2026");

    expect(await screen.findByText(/Live availability · Takamol API/)).toBeInTheDocument();
    // The language comes from the API, not the manual dropdown.
    expect(screen.getByText("Bengali")).toBeInTheDocument();
    expect(screen.getByText(/Takamol lists Bengali for this date/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Selected" })).toBeInTheDocument();
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
    pickLanguage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Step 2/);
    await pickDate("5 Nov 2026");
    await clickContinue();

    await waitFor(() => expect(mocks.targetedHold).toHaveBeenCalled());
    expect(screen.queryByText(/Step 3/)).not.toBeInTheDocument();
  });
});

async function openConfirmation() {
  await screen.findByText(/Signed in to SVP as Noor Rahman/);
  fireEvent.focus(await screen.findByLabelText("Occupation *"));
  fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));
  pickLanguage();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText(/Step 2/);
  await pickDate("5 Nov 2026");
  await clickContinue();
  await screen.findByText(/Step 3/);
}

function submitConfirmedBooking() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create SVP booking" }));
}

describe("automatic SVP candidate record flow", () => {
  it("fills name and passport from SVP while keeping agency optional", async () => {
    renderWizard();
    await openConfirmation();
    expect(screen.getByLabelText("Candidate name *")).toHaveValue("Noor Rahman");
    expect(screen.getByLabelText("Passport *")).toHaveValue("AB123456");
    expect(screen.getByLabelText("Agency")).toHaveValue("");
    expect(mocks.insert).not.toHaveBeenCalled();
    submitConfirmedBooking();
    expect(
      await screen.findByText("Local reservation record saved automatically."),
    ).toBeInTheDocument();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ agency: null, reference_no: "R-123" }),
    );
  });

  it("auto-selects an API category language when the occupation omits its language list", async () => {
    const languageCode = "prometric_english_30_question_category_exam";
    const occupationWithoutLanguages = { ...occupation, languages: [] };
    mocks.occupations.mockResolvedValue({ ok: true, data: [occupationWithoutLanguages] });
    mocks.search.mockResolvedValue({ ok: true, data: [occupationWithoutLanguages] });
    mocks.occupationById.mockResolvedValue({ ok: true, data: occupationWithoutLanguages });
    mocks.overview.mockResolvedValue({
      ok: true,
      data: {
        permissions: {
          freeReservations: true,
          targeted: true,
          countryId: 4,
          countryName: "Bangladesh",
          permissionKeys: ["book_appointment"],
        },
        categories: [
          {
            id: 159,
            name: "Welding",
            arabicName: null,
            languages: [
              { code: languageCode, label: "English", questionCount: 30, nonTargeted: false },
            ],
          },
        ],
        constraints: { rescheduleTimes: 1, bookingHoldSeconds: 600, cancellationLimitHours: 48 },
        flags: { rescheduleEnabled: true, creditsEnabled: true },
        credits: 0,
      },
    });

    renderWizard();
    fireEvent.focus(await screen.findByLabelText("Occupation *"));
    fireEvent.click(await screen.findByRole("button", { name: /Welder/ }));

    const languageSelect = screen.getByLabelText("Exam language *") as HTMLSelectElement;
    expect(languageSelect).toHaveValue("");
    await waitFor(() =>
      expect(
        Array.from((screen.getByLabelText("Exam language *") as HTMLSelectElement).options).map(
          (entry) => entry.textContent?.trim(),
        ),
      ).toContain("English"),
    );
    pickLanguage();
    expect(screen.getByLabelText("Exam language *")).not.toHaveValue("");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("requires missing provider passport without inventing it", async () => {
    mocks.status.mockResolvedValue({
      signedIn: true,
      userName: "Noor Rahman",
      userPassport: null,
      login: "noor@example.com",
      expiresAt: 1_900_000_000,
    });
    renderWizard();
    await openConfirmation();
    expect(screen.getByLabelText("Candidate name *")).toHaveValue("Noor Rahman");
    expect(screen.getByLabelText("Passport *")).toHaveValue("");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Create SVP booking" })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("cleans a formatted passport and still blocks a short one", async () => {
    renderWizard();
    await openConfirmation();
    const input = screen.getByLabelText("Passport *") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "ab-123456" } });
    expect(input.value).toBe("AB123456");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Create SVP booking" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "AB" } });
    expect(screen.getByRole("button", { name: "Create SVP booking" })).toBeDisabled();
    expect(screen.getByText(/Use 5–20 letters and numbers/)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never saves a local record when SVP rejects reservation creation", async () => {
    mocks.create.mockResolvedValue({
      ok: false,
      needsSignIn: false,
      message: "Reservation rejected",
    });
    renderWizard();
    await openConfirmation();
    submitConfirmedBooking();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create SVP booking" })).toBeEnabled(),
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(screen.queryByText("Reservation created")).not.toBeInTheDocument();
  });

  it("retries only the local save after a successful SVP booking", async () => {
    mocks.insert
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValue("recovered-row");
    renderWizard();
    await openConfirmation();
    submitConfirmedBooking();
    const retry = await screen.findByRole("button", { name: "Retry local save" });
    expect(screen.getByText(/Do not book again/)).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: "New booking" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Book another" })).toBeDisabled();
    fireEvent.click(retry);
    expect(
      await screen.findByText("Local reservation record saved automatically."),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: "New booking" })
        .every((button) => !(button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Book another" })).toBeEnabled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insert.mock.calls[1]?.[0]).toEqual(mocks.insert.mock.calls[0]?.[0]);
  });

  it("records pending-payment reservations without claiming they are confirmed", async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      data: {
        reservationId: "R-124",
        paid: false,
        paymentRequired: true,
        credits: 0,
        message: "Payment pending",
      },
    });
    renderWizard();
    await openConfirmation();
    submitConfirmedBooking();
    await screen.findByText("Local reservation record saved automatically.");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reference_no: "R-124", status: "draft" }),
    );
    expect(screen.getByText(/not confirmed until payment/)).toBeInTheDocument();
  });

  it("opens the secure SVP payment in a new tab when payment is required", async () => {
    const tab = {
      closed: false,
      document: { write: vi.fn(), close: vi.fn() },
      location: { href: "" },
      close: vi.fn(),
    };
    vi.mocked(window.open).mockReturnValue(tab as unknown as Window);
    mocks.create.mockResolvedValue({
      ok: true,
      data: {
        reservationId: "R-900",
        paid: false,
        paymentRequired: true,
        credits: 0,
        message: "Payment pending",
      },
    });

    renderWizard();
    await openConfirmation();
    submitConfirmedBooking();

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(tab.document.write).toHaveBeenCalled();
    await waitFor(() => expect(tab.location.href).toBe("/svp-booking?payReservation=R-900"));
    expect(await screen.findByText(/Start the official SVP card payment/i)).toBeInTheDocument();
  });

  it("keeps the pre-submission snapshot and prevents concurrent local saves", async () => {
    let finishSave!: (id: string) => void;
    mocks.insert.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishSave = resolve;
        }),
    );
    renderWizard();
    await openConfirmation();
    submitConfirmedBooking();
    await screen.findByText(/Saving the local reservation record automatically/);
    expect(screen.getByRole("button", { name: "Book another" })).toBeDisabled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    finishSave("saved-row");
    await screen.findByText("Local reservation record saved automatically.");
  });
});

describe("SVP account activity", () => {
  it("shows real card payments and cancels a reservation through the DELETE route", async () => {
    mocks.payments.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "2596452",
          amount: 85,
          status: "paid",
          transactionStatus: "success",
          reservationId: "R-123",
          invoiceId: null,
          createdAt: "2026-10-20T10:00:00Z",
        },
      ],
    });
    mocks.notifications.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "n1",
          title: "Payment received",
          message: "Your card payment was confirmed.",
          createdAt: "2026-10-20",
          read: false,
        },
      ],
    });
    mocks.reservations.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "R-123",
          status: "reserved",
          laborName: "Noor Rahman",
          occupationName: "Welder",
          occupationEnglishName: "Welder",
          centerName: "Dhaka Center",
          city: "Dhaka",
          startAt: "2026-11-05 09:30:00",
          canBeRescheduled: true,
          certificate: null,
          examResult: null,
          finalResult: null,
        },
      ],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWizard();

    expect(await screen.findByText("Payments & notifications")).toBeInTheDocument();
    expect(screen.getByText("#2596452")).toBeInTheDocument();
    expect(screen.getByText("85 SAR")).toBeInTheDocument();
    expect(screen.getByText("Payment received")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith({ data: { reservationId: "R-123" } }),
    );
    expect(confirmSpy).toHaveBeenCalled();
  });
});
