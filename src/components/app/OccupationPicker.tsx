import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Occ = { id: string; name: string };
const KEY = "occ-usage";
const POPULAR = ["Building Electrician", "Plumber", "Brick mason", "Carpenter", "Auto Mechanic", "Welder", "Painter", "Car Driver", "Construction Worker", "Farm worker", "Barber", "Chef"];

export function OccupationPicker({ items, value, onChange }: { items: Occ[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setUsage(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* ignore */ }
  }, []);

  const { top, rest } = useMemo(() => {
    const score = (o: Occ) => (usage[o.id] ?? 0) * 100 + (POPULAR.findIndex((p) => p.toLowerCase() === o.name.toLowerCase()) >= 0 ? 50 - POPULAR.findIndex((p) => p.toLowerCase() === o.name.toLowerCase()) : 0);
    const pin = items.filter((o) => o.name.trim().toLowerCase() === "load and unload worker");
    const ranked = [...pin, ...items.filter((o) => !pin.includes(o) && score(o) > 0).sort((a, b) => score(b) - score(a)).slice(0, 11)];
    const ids = new Set(ranked.map((o) => o.id));
    return { top: ranked, rest: items.filter((o) => !ids.has(o.id)) };
  }, [items, usage]);

  const pick = (id: string) => {
    const next = { ...usage, [id]: (usage[id] ?? 0) + 1 };
    setUsage(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    onChange(id);
    setOpen(false);
  };
  const selected = items.find((o) => o.id === value);
  const Item = ({ o }: { o: Occ }) => (
    <CommandItem value={`${o.name}-${o.id}`} onSelect={() => pick(o.id)}>
      <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
      {o.name}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name ?? "পেশা নির্বাচন বা খুঁজুন..."}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="পেশা খুঁজুন..." />
          <CommandList className="max-h-72">
            <CommandEmpty>কোনো পেশা পাওয়া যায়নি</CommandEmpty>
            {top.length > 0 && <CommandGroup heading="বেশি ব্যবহৃত">{top.map((o) => <Item key={o.id} o={o} />)}</CommandGroup>}
            <CommandGroup heading="সব পেশা">{rest.map((o) => <Item key={o.id} o={o} />)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
