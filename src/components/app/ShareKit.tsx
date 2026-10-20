import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Image as ImageIcon, Loader2, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renderListImages, type ListImageSpec } from "@/lib/list-image";

type Props = {
  label?: string;
  title: string;
  text: string;
  spec: ListImageSpec;
  /** 8801XXXXXXXXX — opens chat with this number for text sharing. */
  wa?: string | null;
  disabled?: boolean;
  size?: "sm" | "default";
};

/** WhatsApp / WhatsApp Business sharing: text, image(s), text+image, download, copy — with preview. */
export function ShareKit({ label = "WhatsApp", title, text, spec, wa, disabled, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    renderListImages(spec)
      .then((f) => { if (alive) { setFiles(f); setUrls(f.map((x) => URL.createObjectURL(x))); } })
      .catch(() => toast.error("ছবি তৈরি করা যায়নি — লেখা পাঠান"))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("লেখা কপি হয়েছে"); } catch { toast.error("কপি করা যায়নি"); }
  };
  const sendText = () => window.open(`https://wa.me/${wa ?? ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  const download = () => files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement("a"); a.href = urls[i]!; a.download = f.name; a.click();
  }, i * 300));
  const shareImages = async (withText: boolean) => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (withText) { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }
    if (nav.share && nav.canShare?.({ files })) {
      try {
        await nav.share(withText ? { files, text } : { files });
        toast.success(withText ? "শেয়ার হয়েছে — লেখা না এলে Paste করুন (কপি করা আছে)" : "ছবি শেয়ার হয়েছে");
        return;
      } catch (e) { if ((e as DOMException)?.name === "AbortError") return; }
    }
    download();
    toast.info("এই ডিভাইসে সরাসরি শেয়ার হয় না — ছবি ডাউনলোড হয়েছে, WhatsApp-এ সংযুক্ত করুন");
    if (withText) sendText();
  };

  return (
    <>
      <Button size={size} disabled={disabled} onClick={() => setOpen(true)}><MessageCircle className="mr-1 h-4 w-4" />{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {busy ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />ছবি তৈরি হচ্ছে...</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {urls.map((u, i) => <img key={u} src={u} alt={`ছবি ${i + 1}`} className="h-64 shrink-0 rounded-lg border object-contain" />)}
            </div>
          )}
          {files.length > 1 && <p className="text-xs text-muted-foreground">তালিকা বড় হওয়ায় {files.length}টি ছবি তৈরি হয়েছে — কোনো তথ্য বাদ যায়নি।</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={sendText}><MessageCircle className="mr-1 h-4 w-4" />শুধু লেখা</Button>
            <Button variant="outline" disabled={busy || !files.length} onClick={() => shareImages(false)}><ImageIcon className="mr-1 h-4 w-4" />শুধু ছবি</Button>
            <Button disabled={busy || !files.length} onClick={() => shareImages(true)}><Share2 className="mr-1 h-4 w-4" />ছবি + লেখা</Button>
            <Button variant="outline" disabled={busy || !files.length} onClick={download}><Download className="mr-1 h-4 w-4" />ডাউনলোড</Button>
            <Button variant="outline" className="col-span-2" onClick={copy}><Copy className="mr-1 h-4 w-4" />লেখা কপি</Button>
          </div>
          <p className="text-xs text-muted-foreground">মোবাইলে "শুধু ছবি" বা "ছবি + লেখা" চাপলে শেয়ার মেনু খুলবে — সেখান থেকে WhatsApp বা WhatsApp Business বাছুন।</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
