"use client";

import { formatBytes } from "./overview/shared";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface StorageChartProps {
  data: Record<string, { count: number; size: number }>;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function StorageChart({ data }: StorageChartProps) {
  const chartData = Object.entries(data)
    .filter(([, stats]) => stats.size > 0 || stats.count > 0)
    .map(([name, stats]) => ({
    name,
    value: stats.size,
    count: stats.count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No storage data available
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={80}
            paddingAngle={chartData.length > 1 ? 2 : 0}
            stroke="hsl(var(--card))"
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
                    <p className="font-medium text-popover-foreground">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Size: {formatBytes(data.value)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Versions: {data.count}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
