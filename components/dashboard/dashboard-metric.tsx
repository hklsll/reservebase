import { CalendarDays, Clock3, Package, Sparkles } from 'lucide-react'
import type { DashboardMetric as DashboardMetricType, MetricIcon } from '@/types/dashboard'

const metricIcons = { calendar: CalendarDays, package: Package, clock: Clock3, sparkles: Sparkles } satisfies Record<MetricIcon, typeof Package>

export function DashboardMetric({ label, value, icon }: DashboardMetricType) {
  const Icon = metricIcons[icon]
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div><div className="metric-value">{value}</div></div>
}
