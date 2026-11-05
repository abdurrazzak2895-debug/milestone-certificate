import { useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type CertInfo = {
  name: string;
  passport: string;
  occupation: string;
  occupationId: string | null;
  examAt: string;
  result: string;
  ref: string;
};

const OFFICIAL_URL = "https://svp-international.qiwa.sa/applicant-result";
const SITE = "https://milestonecertificate.lovable.app";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export const verifyUrl = (d: CertInfo) =>
  `${SITE}/result-check?passport=${encodeURIComponent(d.passport)}${d.occupationId ? `&occ=${encodeURIComponent(d.occupationId)}` : ""}`;

async function buildHtml(d: CertInfo) {
  const qr = await QRCode.toDataURL(OFFICIAL_URL, {
    margin: 1,
    width: 260,
    color: { dark: "#0f3d2e", light: "#ffffff" },
  });
  const pass = d.result === "PASS";
  const col = pass ? "#047857" : "#b91c1c";
  const row = (k: string, v: string) => `<tr><th>${k}</th><td>${esc(v || "—")}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Result Certificate - ${esc(d.passport)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Hind+Siliguri:wght@400;600&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#e5e7eb}
.page{width:210mm;height:296mm;page-break-inside:avoid;break-inside:avoid;margin:0 auto;background:#fffdf7;position:relative;overflow:hidden;font-family:Montserrat,sans-serif;color:#1f2937}
.b1{position:absolute;inset:8mm;border:2.5mm solid #0f3d2e}
.b2{position:absolute;inset:12mm;border:.6mm solid #c9a227}
.b3{position:absolute;inset:13.5mm;border:.3mm dashed #c9a227}
.corner{position:absolute;width:22mm;height:22mm;border:1mm solid #c9a227}
.c1{top:16mm;left:16mm;border-right:0;border-bottom:0}.c2{top:16mm;right:16mm;border-left:0;border-bottom:0}
.c3{bottom:16mm;left:16mm;border-right:0;border-top:0}.c4{bottom:16mm;right:16mm;border-left:0;border-top:0}
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font:800 30mm Cinzel,serif;color:rgba(201,162,39,.13);white-space:nowrap;letter-spacing:4mm}
.in{position:absolute;inset:24mm 22mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.logo{width:26mm;height:26mm;border-radius:50%;border:1mm solid #c9a227;object-fit:cover}
h1{font:800 11mm/1.1 Cinzel,serif;color:#0f3d2e;margin:4mm 0 1mm;letter-spacing:.6mm}
.tag{font-size:3.4mm;letter-spacing:1.2mm;color:#a16207;text-transform:uppercase}
.title{margin-top:7mm;font:600 8mm Cinzel,serif;color:#1f2937}
.rule{width:60mm;height:.6mm;background:linear-gradient(90deg,transparent,#c9a227,transparent);margin:3mm auto}
.demo{margin:3mm 0;padding:2mm 8mm;border:.6mm solid #b91c1c;color:#b91c1c;font:700 5mm Montserrat;letter-spacing:1.5mm;border-radius:2mm}
.sub{font-size:3.8mm;color:#4b5563}
.name{font:600 9mm Cinzel,serif;color:#0f3d2e;margin:3mm 0 1mm;border-bottom:.4mm solid #c9a227;padding:0 6mm 1mm}
table{margin-top:5mm;border-collapse:collapse;width:140mm;font-size:4mm}
th{text-align:left;color:#6b7280;font-weight:600;padding:2.2mm 3mm;width:45mm;border-bottom:.3mm solid #e5e7eb}
td{text-align:left;font-weight:700;padding:2.2mm 3mm;border-bottom:.3mm solid #e5e7eb}
.res{margin-top:6mm;display:inline-block;padding:3mm 14mm;border-radius:20mm;background:${col};color:#fff;font:800 9mm Montserrat;letter-spacing:2mm;box-shadow:0 0 0 1.2mm #fff,0 0 0 1.8mm ${col}}
.ver{margin-top:auto;display:flex;gap:5mm;align-items:center;width:100%;text-align:left;font-size:3mm;color:#374151;border-top:.3mm solid #e5e7eb;padding-top:4mm}
.ver img{width:28mm;height:28mm}
.ver a{color:#0f3d2e;word-break:break-all}
.wish{font-family:'Hind Siliguri',sans-serif;font-size:4mm;line-height:1.6;color:#0f3d2e;margin:5mm 6mm 2mm}
.foot{font:700 4mm Cinzel,serif;color:#0f3d2e}.foot small{display:block;font:italic 3.2mm Montserrat;color:#a16207;margin-top:.5mm}
@media screen{.page{box-shadow:0 4px 30px rgba(0,0,0,.2);margin:8mm auto}}
@media print{html,body{background:#fff;width:210mm;height:296mm;overflow:hidden}.page{margin:0;box-shadow:none}}
.congrats{font:800 13mm/1.1 Cinzel,serif;color:#047857;letter-spacing:1mm;margin-top:2mm}
.congrats-bn{font:600 7mm 'Hind Siliguri',sans-serif;color:#a16207;margin-top:1mm}
.big{font:800 12mm/1.15 Cinzel,serif;color:#0f3d2e;margin:5mm 0 2mm;border-bottom:.5mm solid #c9a227;padding:0 6mm 2mm}
.steps{font-family:'Hind Siliguri',sans-serif;font-size:3.5mm;line-height:1.55;margin:1mm 0 0;padding-left:5mm}
.inst{position:absolute;bottom:18mm;left:0;right:0;text-align:center;font:600 3.2mm Cinzel,serif;color:#6b7280;letter-spacing:.6mm}
</style></head><body><div class="page">
<div class="b1"></div><div class="b2"></div><div class="b3"></div>
<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
<div class="in">
${pass ? `<div class="congrats">CONGRATULATIONS!</div><div class="congrats-bn">অভিনন্দন! আপনি সফলভাবে উত্তীর্ণ হয়েছেন</div>` : `<div class="title" style="margin-top:2mm">Exam Result Statement</div><div class="congrats-bn">পরীক্ষার ফলাফল বিবরণী</div>`}
<div class="rule"></div>
<div class="big">${esc(d.name)}</div>
<div class="sub">Skill Verification Program (SVP) examination result</div>
<table>${row("Passport No.", d.passport)}${row("Occupation", d.occupation)}${row("Exam Date", d.examAt)}${row("Reference", d.ref)}</table>
<div class="res">${esc(d.result)}</div>
<p class="wish">${pass ? "“আপনার মেধা ও নিষ্ঠার মাধ্যমে অর্জিত এই ফলাফল আপনার আগামীর পথচলাকে আরও সুদৃঢ় ও সাফল্যমণ্ডিত করুক। আপনার ভবিষ্যৎ কর্মজীবন হোক সমৃদ্ধ ও উজ্জ্বল — আপনার সর্বাঙ্গীণ সাফল্য কামনা করি।”" : "“একটি ফলাফল কখনোই চূড়ান্ত নয়। আরও ভালো প্রস্তুতি ও অনুশীলনের মাধ্যমে আপনি অবশ্যই পরবর্তী পরীক্ষায় সফল হবেন। আপনার পুনঃপ্রস্তুতি ও উজ্জ্বল ভবিষ্যতের জন্য শুভকামনা রইল।”"}</p>
<div class="ver"><img src="${qr}" alt="QR">
<div><b>অফিশিয়াল রেজাল্ট যাচাই (SVP Official)</b><br>QR স্ক্যান করুন অথবা যান: <a href="${OFFICIAL_URL}">${OFFICIAL_URL}</a>
<ol class="steps"><li>Nationality: <b>Bangladesh</b> নির্বাচন করুন</li><li>Occupation: <b>${esc(d.occupation || "—")}</b> নির্বাচন করুন</li><li>Passport No: <b>${esc(d.passport)}</b> লিখে Search চাপুন</li></ol></div></div>
</div>
<div class="inst">Milestone Certificate Institute</div>
</div></body></html>`;
}

/** Reception-only A4 result paper: opens the print dialog directly (no preview). */
export function ResultCertificateButton({ d }: { d: CertInfo }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const html = await buildHtml(d);
      document.getElementById("cert-print-frame")?.remove();
      const f = document.createElement("iframe");
      f.id = "cert-print-frame";
      f.setAttribute("aria-hidden", "true");
      f.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(f);
      const w = f.contentWindow;
      const doc = w?.document;
      if (!w || !doc) throw new Error("no frame");
      doc.open();
      doc.write(html);
      doc.close();
      const fire = () => {
        try {
          w.focus();
          w.print();
        } catch {
          // Older browsers: fall back to a new tab that prints itself.
          const tab = window.open("", "_blank");
          if (!tab) return toast.error("প্রিন্ট খোলা যায়নি — পপআপ অনুমতি দিন");
          tab.document.write(
            html.replace(
              "</body>",
              "<script>window.onload=()=>setTimeout(()=>print(),600)</script></body>",
            ),
          );
          tab.document.close();
        }
      };
      const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
      await Promise.race([
        fonts?.ready ?? Promise.resolve(),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      await new Promise((r) => setTimeout(r, 400));
      fire();
    } catch {
      toast.error("রেজাল্ট পেপার তৈরি করা যায়নি");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={go}>
      <Printer className="mr-1 h-4 w-4" />
      {busy ? "প্রস্তুত হচ্ছে..." : "A4 রেজাল্ট পেপার প্রিন্ট"}
    </Button>
  );
}
