import { useEffect, useState } from "react";
import c1 from "@/assets/bg-cosmic-1.jpg";
import r1 from "@/assets/bg-robot-1.jpg";
import c2 from "@/assets/bg-cosmic-2.jpg";
import r2 from "@/assets/bg-robot-2.jpg";
import t1 from "@/assets/bg-tech-1.jpg";
import c3 from "@/assets/bg-cosmic-3.jpg";

const IMAGES = [c1, r1, c2, r2, t1, c3];

export function TechBackground() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % IMAGES.length), 7000);
    return () => clearInterval(id);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {IMAGES.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms] ease-in-out"
          style={{ opacity: idx === i ? 0.35 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background/90" />
    </div>
  );
}
