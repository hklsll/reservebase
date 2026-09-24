export type MetricIcon = 'calendar' | 'package' | 'clock' | 'sparkles'

export type DashboardMetric = { label: string; value: string; icon: MetricIcon }

export type Activity = { id: string; message: string; time: string; tone: 'coral' | 'blue' | 'mint' | 'lavender' }

export type ScheduleItem = { id: string; time: string; resourceName: string; requesterName: string; status: string }

export type DashboardData = {
  organizationName: string
  user: { name: string; initials: string; role: string }
  dateLabel: string
  metrics: DashboardMetric[]
  activity: Activity[]
  upcoming: ScheduleItem[]
  overdueCount: number
  pendingCount: number
}
