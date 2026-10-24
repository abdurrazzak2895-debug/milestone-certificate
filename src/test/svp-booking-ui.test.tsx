import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpLoginPanel } from "@/components/app/SvpLoginPanel";

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("@/lib/svp-session.functions", () => ({
  submitSvpLogin: mocks.submit,
}));

afterEach(cleanup);
beforeEach(() => mocks.submit.mockReset());

const loginAccepted = {
  step: "login" as const,
  httpStatus: 200,
  ok: true,
  otpRequired: true,
  authenticated: false,
  message: "SVP accepted the username and password. Enter the OTP sent to the registered email.",
};

const otpAccepted = {
  step: "otp" as const,
  httpStatus: 200,
  ok: true,
  otpRequired: false,
  authenticated: true,
  message: "Signed in to SVP.",
};

describe("SVP login panel", () => {
  it("shows only username and password before login; system fields stay hidden", () => {
    render(<SvpLoginPanel />);

    expect(screen.getByLabelText("SVP username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText("fe_app")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("otp_method")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("locale")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("One-time password (OTP)")).not.toBeInTheDocument();
  });

  it("submits only username/password then advances to the OTP input", async () => {
    mocks.submit.mockResolvedValueOnce(loginAccepted);
    render(<SvpLoginPanel />);

    fireEvent.change(screen.getByLabelText("SVP username"), {
      target: { value: "candidate-login" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith({
        data: { step: "login", login: "candidate-login", password: "password-value" },
      }),
    );
    expect(await screen.findByLabelText("One-time password (OTP)")).toBeInTheDocument();
    expect(screen.getByText(/Enter the OTP sent to the registered email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("fe_app")).not.toBeInTheDocument();
  });

  it("submits the OTP attempt with the in-memory login fields", async () => {
    mocks.submit.mockResolvedValueOnce(loginAccepted).mockResolvedValueOnce(otpAccepted);
    render(<SvpLoginPanel />);

    fireEvent.change(screen.getByLabelText("SVP username"), {
      target: { value: "candidate-login" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("One-time password (OTP)");
    fireEvent.change(screen.getByLabelText("One-time password (OTP)"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenLastCalledWith({
        data: {
          step: "otp",
          login: "candidate-login",
          password: "password-value",
          otpAttempt: "123456",
        },
      }),
    );
    expect(await screen.findByText("Signed in to SVP.")).toBeInTheDocument();
  });

  it("keeps the login step and shows the provider error when SVP rejects the credentials", async () => {
    mocks.submit.mockResolvedValueOnce({
      step: "login",
      httpStatus: 401,
      ok: false,
      otpRequired: false,
      authenticated: false,
      message: "SVP rejected this username or password.",
    });
    render(<SvpLoginPanel />);

    fireEvent.change(screen.getByLabelText("SVP username"), {
      target: { value: "candidate-login" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SVP rejected this username or password.",
    );
    expect(screen.queryByLabelText("One-time password (OTP)")).not.toBeInTheDocument();
  });

  it("reset clears the in-memory form and returns to username/password", async () => {
    mocks.submit.mockResolvedValueOnce(loginAccepted);
    render(<SvpLoginPanel />);
    fireEvent.change(screen.getByLabelText("SVP username"), {
      target: { value: "candidate-login" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("One-time password (OTP)");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("SVP username")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByLabelText("One-time password (OTP)")).not.toBeInTheDocument();
  });
});
