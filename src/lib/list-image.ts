/** Renders a titled list into one or more mobile-friendly PNG pages (no row is ever dropped). */
export type ListRow = { title: string; lines: string[] };
export type ListImageSpec = {
  heading: string;
  sub?: string;
  rows: ListRow[];
  footer?: string;
  photoUrl?: string;
};

const W = 1080;
const PER_PAGE = 8;

export function chunkRows<T>(rows: T[], per = PER_PAGE): T[][] {
  if (!rows.length) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}

async function loadImg(url: string) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  return bmp;
}

export async function renderListImages(spec: ListImageSpec): Promise<File[]> {
  if (typeof document !== "undefined") await document.fonts?.ready;
  const pages = chunkRows(spec.rows);
  let photo: ImageBitmap | null = null;
  if (spec.photoUrl) {
    try {
      photo = await loadImg(spec.photoUrl);
    } catch {
      photo = null;
    }
  }
  const files: File[] = [];
  for (let p = 0; p < pages.length; p++) {
    const rows = pages[p]!;
    const photoH = photo && p === 0 ? 520 : 0;
    const rowH = (r: ListRow) => 70 + r.lines.length * 44;
    const H = Math.max(700, 260 + photoH + rows.reduce((s, r) => s + rowH(r) + 18, 0) + 140);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#04261c");
    bg.addColorStop(1, "#0b3b2c");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#10b981";
    g.fillRect(0, 0, W, 12);
    g.fillStyle = "#ffffff";
    g.font = "bold 50px 'Hind Siliguri', 'Noto Sans Bengali', sans-serif";
    g.fillText(spec.heading, 50, 100);
    g.fillStyle = "#a7f3d0";
    g.font = "32px 'Hind Siliguri', 'Noto Sans Bengali', sans-serif";
    const sub = [spec.sub, pages.length > 1 ? `পৃষ্ঠা ${p + 1}/${pages.length}` : ""]
      .filter(Boolean)
      .join(" · ");
    if (sub) g.fillText(sub, 50, 155);
    let y = 200;
    if (photo && p === 0) {
      const ratio = Math.max((W - 100) / photo.width, 500 / photo.height);
      const sw = (W - 100) / ratio,
        sh = 500 / ratio;
      g.drawImage(
        photo,
        (photo.width - sw) / 2,
        (photo.height - sh) / 2,
        sw,
        sh,
        50,
        y,
        W - 100,
        500,
      );
      y += photoH;
    }
    for (const r of rows) {
      const h = rowH(r);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.beginPath();
      g.roundRect(40, y, W - 80, h, 22);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "bold 38px 'Hind Siliguri', 'Noto Sans Bengali', sans-serif";
      g.fillText(r.title, 70, y + 52, W - 140);
      g.fillStyle = "#d1fae5";
      g.font = "32px 'Hind Siliguri', 'Noto Sans Bengali', sans-serif";
      r.lines.forEach((l, i) => g.fillText(l, 70, y + 100 + i * 44, W - 140));
      y += h + 18;
    }
    if (!rows.length) {
      g.fillStyle = "#d1fae5";
      g.font = "34px sans-serif";
      g.fillText("কোনো তথ্য নেই", 70, y + 50);
    }
    g.fillStyle = "#6ee7b7";
    g.font = "bold 32px 'Hind Siliguri', 'Noto Sans Bengali', sans-serif";
    g.fillText(spec.footer ?? "Milestone Certificate Institute", 50, H - 60);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
    files.push(new File([blob], `list-${Date.now()}-${p + 1}.png`, { type: "image/png" }));
  }
  return files;
}
