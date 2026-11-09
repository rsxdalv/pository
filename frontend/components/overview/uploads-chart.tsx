"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBytes, tooltipStyle } from "./shared";

interface Props {
  data: { date: string; count: number; size: number }[];
}

function shortDate(d: string) {
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(dt.getTime())
    ? d
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dt);
}

export function UploadsChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0 || total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No uploads in the last 30 days
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            stroke="hsl(var(--border))"
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(value, _n, item) => [
              `${value} (${formatBytes((item?.payload as { size?: number })?.size ?? 0)})`,
              "Uploads",
            ]}
          />
          <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
