import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpCardPayment, SvpPaymentPage } from "@/components/app/SvpCardPayment";

const mocks = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn() }));

vi.mock("@/lib/svp-booking.functions", () => ({
  startSvpReservationPayment: mocks.start,
  getSvpPaymentStatus: mocks.status,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockReset();
  mocks.status.mockReset();
  // jsdom has no tab support; individual tests override this with a fake tab.
  vi.spyOn(window, "open").mockImplementation(() => null);
  document.head.querySelectorAll("script[data-svp-payment]").forEach((node) => node.remove());
});

const session = {
  paymentId: "2596452",
  amount: 85,
  hyperpayUrl: "https://eu-test.oppwa.com",
  checkoutId: "checkout-abc",
  integrity: null,
};

describe("SVP card payment", () => {
  it("starts the real SVP payment and mounts the provider widget", async () => {
    mocks.start.mockResolvedValue({ ok: true, data: session });
    render(<SvpCardPayment reservationId="4066364" amountHint={85} />);

    expect(screen.getByText(/Card details are entered in the provider/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start card payment" }));

    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({ data: { reservationId: "4066364" } }),
    );

    // Amount + payment id summary
    expect(await screen.findByText("85 SAR")).toBeInTheDocument();
    expect(screen.getByText(/Payment ID 2596452/)).toBeInTheDocument();

    // The official widget script is loaded from the URL SVP returned.
    await waitFor(() => {
      const script = document.head.querySelector<HTMLScriptElement>("script[data-svp-payment]");
      expect(script?.src).toBe(
        "https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=checkout-abc",
      );
    });

    // …and the card form posts back to this page with the payment id.
    const form = document.querySelector<HTMLFormElement>("form.paymentWidgets");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("data-brands")).toBe("VISA MASTER");
    expect(form?.action).toContain("/svp-booking?paymentId=2596452");

    // The widget sits in a white card and receives explicit light-theme colours.
    expect(form?.closest(".svp-card-widget")).not.toBeNull();
    const options = (
      window as unknown as { wpwlOptions?: { style?: { base?: { color?: string } } } }
    ).wpwlOptions;
    expect(options?.style?.base?.color).toBe("#0f172a");
  });

  it("verifies the payment id returned by the provider redirect", async () => {
    const onPaid = vi.fn();
    mocks.status.mockResolvedValue({
      ok: true,
      data: { transactionStatus: "success", reservationId: "4066364", paid: true },
    });

    render(<SvpCardPayment reservationId="4066364" initialPaymentId="2596452" onPaid={onPaid} />);

    await waitFor(() =>
      expect(mocks.status).toHaveBeenCalledWith({ data: { paymentId: "2596452" } }),
    );
    expect(await screen.findByText(/Payment verified with SVP/i)).toBeInTheDocument();
    expect(onPaid).toHaveBeenCalledWith("4066364");
  });

  it("surfaces the SVP error when the checkout cannot start", async () => {
    mocks.start.mockResolvedValue({
      ok: false,
      needsSignIn: false,
      message: "SVP could not start the card payment.",
    });
    render(<SvpCardPayment reservationId="4066364" />);

    fireEvent.click(screen.getByRole("button", { name: "Start card payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SVP could not start the card payment.",
    );
    expect(document.querySelector("script[data-svp-payment]")).toBeNull();
  });

  it("keeps the pending status visible when the payment is not complete yet", async () => {
    mocks.start.mockResolvedValue({ ok: true, data: session });
    mocks.status.mockResolvedValue({
      ok: true,
      data: { transactionStatus: "pending", reservationId: null, paid: false },
    });
    const { toast } = await import("sonner");

    render(<SvpCardPayment reservationId="4066364" />);
    fireEvent.click(screen.getByRole("button", { name: "Start card payment" }));
    await screen.findByText("85 SAR");

    fireEvent.click(screen.getByRole("button", { name: /Check payment status/ }));

    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(toast.message).toHaveBeenCalledWith(expect.stringContaining("pending"));
    expect(screen.queryByText(/Payment verified with SVP/i)).not.toBeInTheDocument();
  });

  it("starts the checkout automatically in the payment tab and posts back to it", async () => {
    mocks.start.mockResolvedValue({ ok: true, data: session });
    render(<SvpPaymentPage reservationId="4066364" />);
    expect(document.querySelector(".svp-payment-page")).not.toBeNull();
    expect(document.querySelector(".payment-card")).not.toBeNull();

    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({ data: { reservationId: "4066364" } }),
    );

    await waitFor(() => {
      const form = document.querySelector<HTMLFormElement>("form.paymentWidgets");
      expect(form).not.toBeNull();
      expect(form?.action).toContain("/svp-booking?payReservation=4066364&paymentId=2596452");
    });
    expect(screen.getByText(/SVP card payment/)).toBeInTheDocument();
  });

  it("verifies the payment inside the payment tab after the provider redirect", async () => {
    mocks.status.mockResolvedValue({
      ok: true,
      data: { transactionStatus: "success", reservationId: "4066364", paid: true },
    });

    render(<SvpPaymentPage reservationId="4066364" initialPaymentId="2596452" />);

    expect(await screen.findByText(/Payment verified with SVP/i)).toBeInTheDocument();
    expect(await screen.findByText(/You can close this tab/i)).toBeInTheDocument();
  });
});
