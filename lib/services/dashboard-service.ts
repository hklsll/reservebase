import { listReservations } from '@/lib/reservations/reservation-service'
import { listResources } from '@/lib/resources/resource-service'
import { createClient } from '@/lib/supabase/server'
import type { Activity, DashboardData, ScheduleItem } from '@/types/dashboard'
import type { ReservationStatus } from '@/types/reservation'

type DashboardIdentity = Pick<DashboardData, 'organizationName' | 'user'> & { organizationId: string }
type ActivityRow = { id: string; kind: 'requested' | 'status_changed' | 'checked_out' | 'returned'; next_status: ReservationStatus | null; created_at: string; resources: { name: string } | { name: string }[] | null }

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return minutes + ' min ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' hr ago'
  return Math.floor(hours / 24) + ' days ago'
}

function isActive(status: ReservationStatus) {
  return status === 'pending' || status === 'approved' || status === 'reserved' || status === 'checked_out' || status === 'overdue'
}

function activityMessage(row: ActivityRow) {
  const resource = Array.isArray(row.resources) ? row.resources[0] : row.resources
  const name = resource?.name ?? 'Resource'
  if (row.kind === 'requested') return name + ' reservation requested'
  if (row.kind === 'checked_out') return name + ' checked out'
  if (row.kind === 'returned') return name + ' returned'
  return name + (row.next_status ? ' moved to ' + row.next_status.replaceAll('_', ' ') : ' status updated')
}

export async function getDashboardData(identity: DashboardIdentity): Promise<DashboardData> {
  const supabase = await createClient()
  const [resources, reservations, { data: activityRows, error: activityError }] = await Promise.all([
    listResources(identity.organizationId),
    listReservations(identity.organizationId),
    supabase.from('reservation_activity').select('id, kind, next_status, created_at, resources(name)').eq('organization_id', identity.organizationId).order('created_at', { ascending: false }).limit(5),
  ])
  if (activityError) throw new Error('Unable to load recent activity.')

  const now = Date.now()
  const checkedOutResourceIds = new Set(reservations.filter(reservation => reservation.status === 'checked_out' || reservation.status === 'overdue' || reservation.isOverdue).map(reservation => reservation.resourceId))
  const reservedResourceIds = new Set(reservations.filter(reservation => reservation.status === 'reserved').map(reservation => reservation.resourceId))
  const overdueCount = reservations.filter(reservation => reservation.status === 'overdue' || reservation.isOverdue).length
  const pendingCount = reservations.filter(reservation => reservation.status === 'pending').length
  const upcoming: ScheduleItem[] = reservations.filter(reservation => isActive(reservation.status) && new Date(reservation.startsAt).getTime() >= now).slice(0, 4).map(reservation => ({ id: reservation.id, time: formatTime(reservation.startsAt), resourceName: reservation.resourceName, requesterName: reservation.requestedByName ?? 'Member', status: reservation.status.replaceAll('_', ' ') }))
  const activity: Activity[] = ((activityRows ?? []) as ActivityRow[]).map((row, index) => ({ id: row.id, message: activityMessage(row), time: relativeTime(row.created_at), tone: ['coral', 'blue', 'mint', 'lavender'][index % 4] as Activity['tone'] }))

  return {
    organizationName: identity.organizationName,
    user: identity.user,
    dateLabel: new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
    metrics: [
      { label: 'Total resources', value: String(resources.length), icon: 'package' },
      { label: 'Available now', value: String(resources.filter(resource => resource.status === 'available' && resource.availableQuantity > 0 && !checkedOutResourceIds.has(resource.id)).length), icon: 'sparkles' },
      { label: 'Reserved resources', value: String(new Set([...resources.filter(resource => resource.status === 'reserved').map(resource => resource.id), ...reservedResourceIds]).size), icon: 'calendar' },
      { label: 'Checked out', value: String(checkedOutResourceIds.size), icon: 'package' },
      { label: 'Overdue', value: String(overdueCount), icon: 'clock' },
      { label: 'Pending requests', value: String(pendingCount), icon: 'calendar' },
    ],
    activity,
    upcoming,
    overdueCount,
    pendingCount,
  }
}
