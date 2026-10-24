import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvpOtpLoginDraft } from "@/components/app/SvpOtpLoginDraft";

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("@/lib/svp-session.functions", () => ({
  submitSvpSessionDraft: mocks.submit,
}));

afterEach(cleanup);
beforeEach(() => mocks.submit.mockReset());

const accepted = {
  httpStatus: 200,
  ok: true,
  contentType: "application/json",
  responseKind: "json-object" as const,
  topLevelFieldNames: ["message"],
};

describe("SVP login-only workspace draft", () => {
  it("shows only username and password before login; system fields stay hidden", () => {
    render(<SvpOtpLoginDraft />);

    expect(screen.getByLabelText("SVP username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("fe_app")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("otp_method")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("locale")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("One-time password (OTP)")).not.toBeInTheDocument();
  });

  it("submits only username/password then advances to the OTP input on HTTP success", async () => {
    mocks.submit.mockResolvedValueOnce(accepted);
    render(<SvpOtpLoginDraft />);

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
    expect(screen.queryByLabelText("fe_app")).not.toBeInTheDocument();
    expect(screen.getByText(/does not confirm an authenticated session/i)).toBeInTheDocument();
  });

  it("submits the OTP attempt with the in-memory login fields and no provider response values", async () => {
    mocks.submit.mockResolvedValueOnce(accepted).mockResolvedValueOnce(accepted);
    render(<SvpOtpLoginDraft />);

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
    expect(screen.getByText(/No SVP session is stored or confirmed/i)).toBeInTheDocument();
  });

  it("reset clears the in-memory form and returns to username/password", async () => {
    mocks.submit.mockResolvedValueOnce(accepted);
    render(<SvpOtpLoginDraft />);
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
