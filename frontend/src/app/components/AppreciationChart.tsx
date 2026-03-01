/**
 * AppreciationChart.tsx
 *
 * Line chart showing house appreciation projections for 6, 12, and 36 months
 * under best/average/worst economic scenarios.
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

interface ScenarioResult {
  appreciation_pct: number;
  projected_value: number | null;
}

interface HorizonProjection {
  months: number;
  best: ScenarioResult;
  avg: ScenarioResult;
  worst: ScenarioResult;
}

interface AppreciationChartProps {
  projections: HorizonProjection[];
  currentPrice: number;
}

export function AppreciationChart({ projections, currentPrice }: AppreciationChartProps) {
  // Transform data for Recharts
  const chartData = [
    {
      months: 0,
      monthsLabel: 'Now',
      best: currentPrice,
      avg: currentPrice,
      worst: currentPrice,
    },
    ...projections.map(p => ({
      months: p.months,
      monthsLabel: `${p.months}mo`,
      best: p.best.projected_value || currentPrice,
      avg: p.avg.projected_value || currentPrice,
      worst: p.worst.projected_value || currentPrice,
    }))
  ];

  const formatCurrency = (value: number) => {
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const formatTooltipValue = (value: number) => {
    return `$${value.toLocaleString()}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Future Value Projections</CardTitle>
        <CardDescription>
          Estimated home value over time under different economic scenarios
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="monthsLabel"
              className="text-sm"
              label={{ value: 'Time Horizon', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              className="text-sm"
              label={{ value: 'Home Value', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={formatTooltipValue}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
            />
            <Line
              type="monotone"
              dataKey="best"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              name="Best Case"
              dot={{ fill: 'hsl(var(--chart-1))' }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              name="Average"
              dot={{ fill: 'hsl(var(--chart-2))' }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="worst"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              name="Worst Case"
              dot={{ fill: 'hsl(var(--chart-3))' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950">
            <div className="text-sm font-medium text-green-900 dark:text-green-100">
              Best Case (36mo)
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">
              {projections[2]?.best.appreciation_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-green-600 dark:text-green-400">
              {formatTooltipValue(projections[2]?.best.projected_value || currentPrice)}
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Average (36mo)
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {projections[2]?.avg.appreciation_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {formatTooltipValue(projections[2]?.avg.projected_value || currentPrice)}
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-950">
            <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
              Worst Case (36mo)
            </div>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
              {projections[2]?.worst.appreciation_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-400">
              {formatTooltipValue(projections[2]?.worst.projected_value || currentPrice)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
