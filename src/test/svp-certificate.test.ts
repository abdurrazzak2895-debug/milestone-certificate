import { describe, expect, it } from "vitest";
import {
  parseSvpReservationDetail,
  parseSvpReservations,
  svpCertificateFileName,
} from "@/lib/svp-api.shared";

// Shape taken from a real SVP reservation detail (passed, certificate issued).
const detail = {
  id: 4066364,
  reservation_status: "completed",
  can_be_canceled: false,
  can_be_rescheduled: false,
  exam_result: "passed",
  final_result: "passed",
  generated: false,
  language_code: "bn",
  methodology: "in_person",
  paid: true,
  occupation: {
    id: 2061,
    english_name: "Load and Unload Worker",
    name: "Load and Unload Worker",
    occupation_key: "933301",
  },
  category: { id: 159, english_name: "Load and unload workers" },
  certificate: {
    id: 998982,
    certificate_number: "907045670",
    created_at: "17-05-2026 15:14",
    free: false,
    status: "active",
    valid_until: "17-05-2031 15:14",
  },
  examination_result: {
    id: 1227803,
    calculated_cbt_score: 23,
    calculated_practical_score: 58,
    cbt_correct_answers_count: 14,
    original_cbt_score: 46,
    original_practical_score: 78,
    reservation_id: 4066364,
    total_score: 81,
  },
  exam_session: {
    id: 1466849,
    duration: 7200,
    start_at_in_tc_time_zone: "2026-05-17 10:00:00",
    test_center: { city: "Rajshahi", name: "Pabna Technical Training Centre" },
  },
  labor: { full_name: "MD RAHADUL ISLAM", passport_number: "A13478023" },
  country: { id: 78, english_name: "Bangladesh" },
};

describe("SVP result and certificate", () => {
  it("reads the passed result, scores and issued certificate", () => {
    const parsed = parseSvpReservationDetail(detail);

    expect(parsed).toMatchObject({
      id: "4066364",
      status: "completed",
      laborName: "MD RAHADUL ISLAM",
      occupationEnglishName: "Load and Unload Worker",
      centerName: "Pabna Technical Training Centre",
      city: "Rajshahi",
      examResult: "passed",
      finalResult: "passed",
      totalScore: 81,
      cbtScore: 23,
      practicalScore: 58,
      examSessionId: 1466849,
      languageCode: "bn",
      countryId: 78,
    });
    expect(parsed?.certificate).toEqual({
      id: "998982",
      certificateNumber: "907045670",
      status: "active",
      validUntil: "17-05-2031 15:14",
      createdAt: "17-05-2026 15:14",
    });
  });

  it("reads the same result summary from the reservation list", () => {
    const [row] = parseSvpReservations({ exam_reservations: [detail] });

    expect(row?.finalResult).toBe("passed");
    expect(row?.totalScore).toBe(81);
    expect(row?.certificate?.id).toBe("998982");
  });

  it("builds the certificate file name from candidate, occupation and test center", () => {
    expect(
      svpCertificateFileName(
        "MD RAHADUL ISLAM",
        "Load and Unload Worker",
        "Pabna Technical Training Centre",
      ),
    ).toBe(
      "MD_RAHADUL_ISLAM_Load_and_Unload_Worker_Pabna_Technical_Training_Centre_SVP_Certificate.pdf",
    );
    expect(svpCertificateFileName(null, null, null)).toBe("SVP_SVP_Certificate.pdf");
    expect(svpCertificateFileName("A/B", undefined, "Center #1")).toBe(
      "A_B_Center_1_SVP_Certificate.pdf",
    );
  });
});
