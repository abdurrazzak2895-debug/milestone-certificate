import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { ReactNode } from "react";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const tip = {
  contentStyle: { borderRadius: 10, border: "1px solid var(--border)", fontFamily: "inherit" },
};

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-surface p-4">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}

export function SimpleBar({
  data,
  dataKey = "value",
  color = "var(--chart-1)",
  unit,
}: {
  data: Record<string, unknown>[];
  dataKey?: string;
  color?: string;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} unit={unit} width={36} />
        <Tooltip {...tip} />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleLine({
  data,
  dataKey,
  unit,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} unit={unit} width={40} />
        <Tooltip {...tip} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimplePie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
