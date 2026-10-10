import brandLogo from "@/assets/brand-logo.png.asset.json";

type Size = "sm" | "md" | "lg";
const dims: Record<Size, string> = { sm: "h-8 w-8", md: "h-20 w-20", lg: "h-32 w-32" };

/** Brand logo loading indicator with neon glow ring. */
export function WorkerLoader({ size = "md", label }: { size?: Size; label?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-3">
      <span className={`relative inline-block ${dims[size]}`}>
        {/* Soft pulsing glow behind the logo */}
        <span className="absolute -inset-2 rounded-full bg-primary/25 blur-md animate-pulse" />
        {/* Rotating neon ring around the logo */}
        <span className="absolute -inset-1 rounded-full border-2 border-primary/25 border-t-primary animate-spin drop-shadow-[0_0_10px_var(--primary)]" />
        <img
          src={brandLogo.url}
          alt=""
          className="relative h-full w-full rounded-full object-cover drop-shadow-[0_0_12px_var(--primary)]"
        />
      </span>
      {label && <span className="text-sm font-medium text-primary animate-pulse">{label}</span>}
    </span>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <WorkerLoader size="lg" label="লোড হচ্ছে..." />
    </div>
  );
}
