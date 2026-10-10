type Size = "sm" | "md" | "lg";
const dims: Record<Size, string> = { sm: "h-6 w-6", md: "h-16 w-16", lg: "h-28 w-28" };

/** Neon worker-with-wrench loading logo. */
export function WorkerLoader({ size = "md", label }: { size?: Size; label?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-3">
      <span className={`relative inline-block ${dims[size]}`}>
        <span className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin drop-shadow-[0_0_8px_var(--primary)]" />
        <span className="absolute inset-[12%] rounded-full border border-accent/30 border-b-accent animate-[spin_1.6s_linear_infinite_reverse]" />
        <svg viewBox="0 0 48 48" className="absolute inset-[18%] text-primary drop-shadow-[0_0_6px_var(--primary)]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 18a10 10 0 0 1 20 0z" fill="currentColor" fillOpacity="0.35" />
          <path d="M11 18h26" />
          <circle cx="24" cy="23" r="4" />
          <path d="M24 27v9M24 36l-5 8M24 36l5 8M24 30l-8 4" />
          <g className="origin-[24px_30px] animate-worker-tool">
            <path d="M24 30l9-5M33 25l3-3m-1 5 4-1" />
          </g>
        </svg>
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
