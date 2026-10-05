import { useRef } from "react";
import { Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Photo picker with a direct-camera button — মোবাইলে সরাসরি ক্যামেরা ওপেন হয়। */
export function PhotoInput({ onFile }: { onFile: (f: File | null) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <Input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" className="shrink-0" onClick={() => camRef.current?.click()}>
        <Camera className="h-4 w-4" /> ক্যামেরা
      </Button>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
