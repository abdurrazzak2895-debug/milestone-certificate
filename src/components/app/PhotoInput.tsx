import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/compress-image";

/** Photo picker with a direct-camera button; photos are auto-compressed before use. */
export function PhotoInput({ onFile }: { onFile: (f: File | null) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | null | undefined) => {
    if (!f) return onFile(null);
    setBusy(true);
    try { onFile(await compressImage(f)); } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2">
      <Input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
      <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => camRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} ক্যামেরা
      </Button>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
