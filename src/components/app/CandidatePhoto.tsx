import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const isImage = (p: string) => /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(p);

/** Candidate photo from private storage (signed URL), falling back to initials. */
export function CandidatePhoto({ path, name, size = 48 }: { path: string | null | undefined; name: string; size?: number }) {
  const usable = !!path && isImage(path);
  const { data: url } = useQuery({
    queryKey: ["photo", path],
    enabled: usable,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from("candidate-photos").createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  });
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <div style={{ width: size, height: size }} className="shrink-0 overflow-hidden rounded-xl border bg-muted ring-2 ring-primary/20">
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{initials}</div>}
    </div>
  );
}
