import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SvpResultPanel } from "@/components/app/SvpResultPanel";
import type { SvpReservation } from "@/lib/svp-api.shared";

afterEach(cleanup);

const reservation: SvpReservation = {
  id: "4066364",
  status: "completed",
  laborName: "MD RAHADUL ISLAM",
  occupationName: "Load and Unload Worker",
  occupationEnglishName: "Load and Unload Worker",
  city: "Rajshahi",
  centerName: "Pabna Technical Training Centre",
  startAt: "2026-05-17 10:00:00",
  methodology: "in_person",
  canBeRescheduled: false,
  categoryId: 159,
  examSessionId: 1466849,
  duration: 7200,
  languageCode: "bn",
  examResult: "passed",
  finalResult: "passed",
  totalScore: 81,
  cbtScore: 23,
  practicalScore: 58,
  certificate: {
    id: "998982",
    certificateNumber: "907045670",
    status: "active",
    validUntil: "17-05-2031 15:14",
    createdAt: "17-05-2026 15:14",
  },
};

function renderPanel(overrides: Partial<SvpReservation> = {}, downloading = false) {
  const onDownloadCertificate = vi.fn();
  const onDownloadCbtResult = vi.fn();
  render(
    <SvpResultPanel
      reservation={{ ...reservation, ...overrides }}
      downloading={downloading}
      onDownloadCertificate={onDownloadCertificate}
      onDownloadCbtResult={onDownloadCbtResult}
    />,
  );
  return { onDownloadCertificate, onDownloadCbtResult };
}

describe("SVP result panel", () => {
  it("shows the passed result, the score chips and the certificate", () => {
    renderPanel();

    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByText("CBT")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Practical")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
    expect(screen.getByText(/Certificate 907045670/)).toBeInTheDocument();
    expect(screen.getByText(/valid until 17-05-2031 15:14/)).toBeInTheDocument();
  });

  it("offers the CBT result PDF named with candidate, occupation and center", () => {
    const { onDownloadCbtResult } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /CBT result PDF/ }));

    expect(onDownloadCbtResult).toHaveBeenCalledWith(
      "MD_RAHADUL_ISLAM_Load_and_Unload_Worker_Pabna_Technical_Training_Centre_SVP_CBT_Result.pdf",
    );
  });

  it("downloads the certificate only when SVP issued an active one", () => {
    const { onDownloadCertificate } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Certificate PDF/ }));
    expect(onDownloadCertificate).toHaveBeenCalledTimes(1);

    cleanup();
    renderPanel({ certificate: { ...reservation.certificate!, status: "pending" } });
    expect(screen.queryByRole("button", { name: /Certificate PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CBT result PDF/ })).toBeInTheDocument();
  });

  it("explains a passed result without a certificate", () => {
    renderPanel({ certificate: null });
    expect(screen.getByText(/has not issued a certificate/i)).toBeInTheDocument();
  });

  it("shows failed results and hides the certificate action", () => {
    renderPanel({
      examResult: "failed",
      finalResult: "failed",
      certificate: null,
      totalScore: 40,
    });

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Certificate PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CBT result PDF/ })).toBeInTheDocument();
  });
});
