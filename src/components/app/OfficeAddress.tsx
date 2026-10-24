import { Copy, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import office from "@/assets/office.jpg.asset.json";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShareKit } from "@/components/app/ShareKit";

const MAP = "https://maps.app.goo.gl/DTbfFjwWJdGFFQdY7";
const PHONES = ["01787900267", "01540602292", "01827901646", "01707116176"];
const TEXT = `আমাদের অফিসের ঠিকানা ও লোকেশন তথ্য:

গন্তব্য/অফিস: ভিশন শোরুমের ৪র্থ তলা
ঠিকানা: ঘোড়াপট্টি, সাতমাথা থেকে (১০০ ফিট দক্ষিণ পাশে), বগুড়া

🗺️ গুগল ম্যাপে লোকেশন: ${MAP}

প্রয়োজনে:
${PHONES.join("\n")}`;

export function OfficeAddressCard() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TEXT);
      toast.success("ঠিকানা কপি হয়েছে");
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };
  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
        <MapPin className="h-5 w-5 text-primary" /> অফিসের ঠিকানা
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[140px_1fr]">
        <a href={office.url} target="_blank" rel="noreferrer">
          <img
            src={office.url}
            alt="অফিস ভবন — ভিশন শোরুম"
            loading="lazy"
            className="h-40 w-full rounded-xl object-cover sm:h-full"
          />
        </a>
        <div className="space-y-1.5 text-sm select-text">
          <p>
            <b>গন্তব্য/অফিস:</b> ভিশন শোরুমের ৪র্থ তলা
          </p>
          <p>
            <b>ঠিকানা:</b> ঘোড়াপট্টি, সাতমাথা থেকে (১০০ ফিট দক্ষিণ পাশে), বগুড়া
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PHONES.map((p) => (
              <a
                key={p}
                href={`tel:${p}`}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
              >
                <Phone className="h-3 w-3" />
                {p}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              <Copy className="h-4 w-4" /> ঠিকানা কপি করুন
            </button>
            <a
              href={MAP}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            >
              <MapPin className="h-4 w-4" /> গুগল ম্যাপ
            </a>
            <ShareKit
              title="অফিসের তথ্য শেয়ার"
              text={TEXT}
              spec={{
                heading: "অফিসের ঠিকানা",
                sub: "Milestone Certificate Institute",
                photoUrl: office.url,
                rows: [
                  {
                    title: "ভিশন শোরুমের ৪র্থ তলা",
                    lines: ["ঘোড়াপট্টি, সাতমাথা থেকে ১০০ ফিট দক্ষিণে, বগুড়া"],
                  },
                  { title: "যোগাযোগ", lines: PHONES },
                  { title: "গুগল ম্যাপ", lines: [MAP] },
                ],
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function OfficeAddress() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/60 bg-card px-2 py-2 text-xs font-semibold text-primary shadow-sm">
          <MapPin className="h-4 w-4" /> অফিস ঠিকানা
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0">
        <DialogTitle className="sr-only">অফিসের ঠিকানা</DialogTitle>
        <OfficeAddressCard />
      </DialogContent>
    </Dialog>
  );
}
