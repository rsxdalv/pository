"use client";

import { Metrics } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface MetricsChartProps {
  metrics: Metrics;
}

export function MetricsChart({ metrics }: MetricsChartProps) {
  const data = Object.entries(metrics.requestsByMethod).map(([method, count]) => ({
    method,
    count,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No request data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {metrics.requestsTotal}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Errors</p>
          <p className="mt-1 text-2xl font-bold text-destructive">
            {metrics.errorsTotal}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Avg Latency</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {metrics.avgLatency.toFixed(0)}ms
          </p>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="method"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
