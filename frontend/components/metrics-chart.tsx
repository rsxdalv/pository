"use client";

import { Metrics } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface MetricsChartProps {
  metrics: Metrics;
}

export function MetricsChart({ metrics }: MetricsChartProps) {
  const data = Object.entries(metrics.requestsByMethod)
    .map(([method, count]) => ({ method, count: Number.isFinite(count) ? count : 0 }))
    .filter((d) => d.count > 0);

  if (data.length === 0 && !(metrics.requestsTotal > 0)) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No request data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-bold sm:text-2xl text-foreground">
            {metrics.requestsTotal.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Errors</p>
          <p className="mt-1 text-xl font-bold sm:text-2xl text-destructive">
            {metrics.errorsTotal}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Avg Latency</p>
          <p className="mt-1 text-xl font-bold sm:text-2xl text-foreground">
            {(Number.isFinite(metrics.avgLatency) ? metrics.avgLatency : 0).toFixed(0)}ms
          </p>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="method"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                color: "hsl(var(--popover-foreground))",
              }}
              labelStyle={{ color: "hsl(var(--popover-foreground))" }}
              itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
            />
            <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
