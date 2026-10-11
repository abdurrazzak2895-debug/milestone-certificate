import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PhotoInput } from "./PhotoInput";
import { CandidatePhoto } from "./CandidatePhoto";
import { agentPhotoPath } from "./AgentPhoto";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

export function AccountPhotoEditor({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const path = agentPhotoPath(id);
  const save = async () => {
    if (!file || busy) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("JPG, PNG অথবা WebP ছবি দিন");
    if (file.size > 5 * 1024 * 1024) return toast.error("ছবির আকার ৫ MB-এর কম হতে হবে");
    setBusy(true);
    try {
      const { error } = await supabase.storage.from("candidate-photos").upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["photo", path] });
      setEditing(false);
      setFile(null);
      toast.success("প্রোফাইল ছবি সংরক্ষণ হয়েছে");
    } catch { toast.error("ছবি সংরক্ষণ করা যায়নি"); }
    finally { setBusy(false); }
  };
  return <div className="w-full space-y-3">
    <div className="flex items-center gap-3"><CandidatePhoto path={path} name={name} size={80} /><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(!editing)}><Camera className="mr-1 h-4 w-4" /> ছবি যোগ / পরিবর্তন</Button></div>
    {editing && <div className="space-y-2"><PhotoInput onFile={setFile} /><Button size="sm" disabled={!file || busy} onClick={save}>{busy ? "সংরক্ষণ হচ্ছে..." : "ছবি সংরক্ষণ করুন"}</Button></div>}
  </div>;
}