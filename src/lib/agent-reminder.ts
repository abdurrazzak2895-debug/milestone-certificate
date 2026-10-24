/** Builds the admin → agent WhatsApp exam reminder (one message per agent per exam date). */
const BN = "০১২৩৪৫৬৭৮৯";
export const bnNum = (n: number | string) => String(n).replace(/\d/g, (d) => BN[Number(d)]!);

export type ReminderCandidate = { name: string; passport: string; occupation: string };

export function buildAgentReminder(agency: string, date: string, list: ReminderCandidate[]) {
  const [y, m, d] = date.split("-");
  const items = list
    .map(
      (c, i) =>
        `${bnNum(i + 1)}. নাম: ${c.name}\n\nপাসপোর্ট নম্বর: ${c.passport}\n\nপেশা: ${c.occupation}`,
    )
    .join("\n\n");
  return `আসসালামু আলাইকুম। 🌸

সম্মানিত পার্টনার ${agency},

📅 পরীক্ষার তারিখ: ${d}/${m}/${y}

আপনার পরীক্ষার্থীদের পূর্ণাঙ্গ তালিকা নিচে প্রদান করা হলো।

📋 পরীক্ষার্থীদের তালিকা

${items}

মোট পরীক্ষার্থী: ${bnNum(list.length)} জন

⚠️ বিশেষ নির্দেশনা:

- প্রত্যেক পরীক্ষার্থীর সঙ্গে অবশ্যই মূল পাসপোর্ট এবং Takamul অ্যাডমিট কার্ড/টিকিট পাঠাতে হবে।

- তালিকার প্রতিটি নাম, পাসপোর্ট নম্বর ও পেশা ভালোভাবে যাচাই করে নেবেন।

- কোনো নাম বাদ পড়লে অথবা অতিরিক্ত নাম থাকলে অনুগ্রহ করে অবিলম্বে জানাবেন।

- পরীক্ষার আগে সব কাগজপত্র সঠিকভাবে প্রস্তুত রাখার জন্য বিশেষভাবে অনুরোধ করা হলো।

আপনাদের আন্তরিক সহযোগিতা কামনা করছি।

ধন্যবাদান্তে,

Milestone Certificate Institute`;
}

/** Agent's saved mobile (01XXXXXXXXX) is their WhatsApp number → 8801XXXXXXXXX. */
export const waNumber = (mobile: string) => {
  const d = (mobile || "").replace(/\D/g, "").replace(/^(88)?/, "");
  return /^01\d{9}$/.test(d) ? `88${d}` : null;
};
