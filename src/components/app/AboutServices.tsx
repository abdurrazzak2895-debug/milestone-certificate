import { Copy, Globe, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const TEXT = `🎓 Milestone Certificate Institute

🌍 Your Trusted Partner in Education, Certification, Documentation & Global Support Services

We proudly provide professional support for students, job seekers, skilled professionals, business owners, and Bangladeshi expatriates worldwide.

📚 Our Services

💻 Computer & Digital Skills Development
📜 Certificate Verification & Attestation Support
📝 Online Applications & Documentation Assistance
🎯 Career Development & Job Preparation
✈️ Visa & Overseas Documentation Support
🎓 Student & Education Visa Assistance
🏥 Medical Tourist Visa Support
🕋 Umrah Visa & Travel Documentation
🌎 Probashi Welfare & Consultancy Services
📂 International Travel Documentation
🏆 Professional Skills Development Programs

🌐 Country-Specific Support

🇸🇦 Saudi Arabia
🇲🇾 Malaysia
🇲🇪 Montenegro
🇷🇸 Serbia

🤝 Through professional networks and trusted partners, we assist clients with educational, professional, travel, and documentation requirements, with a focus on transparency and reliable service.

✅ Professional Guidance
✅ Reliable Documentation Support
✅ Responsive Client Service
✅ Client Satisfaction Priority
✅ International Support Network

💡 Learn With Confidence
📈 Build Your Future
🌍 Explore Global Opportunities
🚀 Achieve Your Goals

📍 Education | Certification | Documentation | Visa Support | Probashi Services

🇧🇩 Serving Bangladesh & the Global Bangladeshi Community

✨ "Your Trust, Our Commitment. Your Success, Our Milestone."`;

const SERVICES = [
  "💻 Computer & Digital Skills Development",
  "📜 Certificate Verification & Attestation Support",
  "📝 Online Applications & Documentation Assistance",
  "🎯 Career Development & Job Preparation",
  "✈️ Visa & Overseas Documentation Support",
  "🎓 Student & Education Visa Assistance",
  "🏥 Medical Tourist Visa Support",
  "🕋 Umrah Visa & Travel Documentation",
  "🌎 Probashi Welfare & Consultancy Services",
  "📂 International Travel Documentation",
  "🏆 Professional Skills Development Programs",
];

export function AboutServicesCard() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TEXT);
      toast.success("সেবার তথ্য কপি হয়েছে");
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };
  return (
    <section className="max-h-[75vh] overflow-y-auto rounded-2xl bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
        <GraduationCap className="h-5 w-5 text-primary" /> Milestone Certificate Institute
      </div>
      <div className="space-y-4 p-4 text-sm select-text">
        <p className="font-semibold">🌍 Your Trusted Partner in Education, Certification, Documentation & Global Support Services</p>
        <p className="text-muted-foreground">We proudly provide professional support for students, job seekers, skilled professionals, business owners, and Bangladeshi expatriates worldwide.</p>

        <div>
          <h3 className="mb-2 font-semibold">📚 Our Services</h3>
          <ul className="space-y-1.5">
            {SERVICES.map((s) => (
              <li key={s} className="rounded-lg bg-muted/40 px-3 py-1.5">{s}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 font-semibold">🌐 Country-Specific Support</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ["🇸🇦", "Saudi Arabia"],
              ["🇲🇾", "Malaysia"],
              ["🇲🇪", "Montenegro"],
              ["🇷🇸", "Serbia"],
            ].map(([flag, name]) => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">{flag} {name}</span>
            ))}
          </div>
        </div>

        <p className="text-muted-foreground">🤝 Through professional networks and trusted partners, we assist clients with educational, professional, travel, and documentation requirements, with a focus on transparency and reliable service.</p>

        <ul className="space-y-1 text-sm">
          {["✅ Professional Guidance", "✅ Reliable Documentation Support", "✅ Responsive Client Service", "✅ Client Satisfaction Priority", "✅ International Support Network"].map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>

        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-center font-semibold leading-relaxed">
          💡 Learn With Confidence<br />
          📈 Build Your Future<br />
          🌍 Explore Global Opportunities<br />
          🚀 Achieve Your Goals
        </div>

        <p className="text-center text-xs text-muted-foreground">📍 Education | Certification | Documentation | Visa Support | Probashi Services</p>
        <p className="text-center font-medium">🇧🇩 Serving Bangladesh & the Global Bangladeshi Community</p>
        <p className="text-center text-sm font-semibold text-primary">✨ "Your Trust, Our Commitment. Your Success, Our Milestone."</p>

        <button onClick={copy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground">
          <Copy className="h-4 w-4" /> পুরো তথ্য কপি করুন
        </button>
      </div>
    </section>
  );
}

export function AboutServices() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/60 bg-card px-2 py-2 text-xs font-semibold text-primary shadow-sm">
          <Globe className="h-4 w-4" /> About
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0">
        <DialogTitle className="sr-only">আমাদের সেবা — Milestone Certificate Institute</DialogTitle>
        <AboutServicesCard />
      </DialogContent>
    </Dialog>
  );
}
