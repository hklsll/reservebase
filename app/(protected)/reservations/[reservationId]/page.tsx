import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckOutForm, ReturnForm } from '@/components/reservations/custody-form'
import { cancelReservationAction, transitionReservationStatusAction } from '@/app/(protected)/reservations/actions'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { getReservation, listReservationActivity } from '@/lib/reservations/reservation-service'
import type { ReservationActivity, ReservationStatus } from '@/types/reservation'

const labels: Record<ReservationStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', reserved: 'Reserved', checked_out: 'Checked out', returned: 'Returned', cancelled: 'Cancelled', overdue: 'Overdue', no_show: 'No show' }
const nextStatuses: Record<ReservationStatus, readonly ReservationStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['reserved', 'cancelled'],
  rejected: [],
  reserved: ['checked_out', 'cancelled', 'no_show'],
  checked_out: ['returned', 'overdue'],
  returned: [],
  cancelled: [],
  overdue: ['returned'],
  no_show: [],
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(date))
}

function activityLabel(activity: ReservationActivity) {
  if (activity.kind === 'requested') return 'Reservation requested'
  if (activity.kind === 'checked_out') return 'Checked out'
  if (activity.kind === 'returned') return 'Returned'
  return activity.nextStatus ? 'Status changed to ' + labels[activity.nextStatus] : 'Status updated'
}

export default async function ReservationDetailPage({ params, searchParams }: { params: Promise<{ reservationId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { reservationId } = await params
  const { created } = await searchParams
  const membership = await requireMembership()
  const reservation = await getReservation(reservationId)
  if (!reservation) notFound()

  const activity = await listReservationActivity(reservationId)
  const canManage = hasPermission(membership.role, 'manage_reservations')
  const canCancel = !canManage && (reservation.status === 'pending' || reservation.status === 'approved')
  const transitions = canManage ? nextStatuses[reservation.status].filter(status => status !== 'checked_out' && status !== 'returned') : []
  const statusLabel = reservation.isOverdue ? 'Overdue' : labels[reservation.status]
  const statusClass = reservation.isOverdue ? 'overdue' : reservation.status
  const canCheckOut = canManage && reservation.status === 'reserved'
  const canReturn = canManage && (reservation.status === 'checked_out' || reservation.status === 'overdue')

  return <main className="resources-page"><Link className="back-link" href="/reservations">← Reservations</Link>{created === '1' && <div className="reservation-confirmation" role="status"><strong>Reservation submitted</strong><span>Your request is pending confirmation.</span></div>}<div className="resource-detail-heading"><div><p className="eyebrow">Reservation</p><h1>{reservation.resourceName}</h1><p>{statusLabel} · {reservation.quantity} unit{reservation.quantity === 1 ? '' : 's'}</p></div><span className={'reservation-status ' + statusClass}>{statusLabel}</span></div><section className="detail-card reservation-detail"><h2>Reservation details</h2><dl><div><dt>Start</dt><dd>{formatDate(reservation.startsAt)}</dd></div><div><dt>End</dt><dd>{formatDate(reservation.endsAt)}</dd></div><div><dt>Purpose</dt><dd>{reservation.purpose}</dd></div><div><dt>Notes</dt><dd>{reservation.notes ?? 'No additional notes.'}</dd></div></dl></section>{reservation.actualCheckoutAt && <section className="detail-card reservation-detail"><h2>Check-out record</h2><dl><div><dt>Checked out</dt><dd>{formatDate(reservation.actualCheckoutAt)}</dd></div><div><dt>Received by</dt><dd>{reservation.receivedBy}</dd></div><div><dt>Condition</dt><dd>{reservation.conditionOut}</dd></div><div><dt>Notes</dt><dd>{reservation.checkoutNotes ?? 'No check-out notes.'}</dd></div></dl></section>}{reservation.actualReturnedAt && <section className="detail-card reservation-detail"><h2>Return record</h2><dl><div><dt>Returned</dt><dd>{formatDate(reservation.actualReturnedAt)}</dd></div><div><dt>Condition</dt><dd>{reservation.conditionIn}</dd></div><div><dt>Notes</dt><dd>{reservation.returnNotes ?? 'No return notes.'}</dd></div></dl></section>}{canCheckOut && <section className="detail-card reservation-detail"><h2>Check out resource</h2><p className="detail-muted">Record who receives the resource and its condition before handover.</p><CheckOutForm reservationId={reservation.id} /></section>}{canReturn && <section className="detail-card reservation-detail"><h2>Return resource</h2><p className="detail-muted">Record the inspected condition. The resource condition will be updated from this record.</p><ReturnForm reservationId={reservation.id} /></section>}{transitions.length > 0 && <section className="detail-card reservation-detail reservation-lifecycle"><h2>Update status</h2><p className="detail-muted">Only valid next steps are available.</p><div className="resource-actions">{transitions.map(nextStatus => <form key={nextStatus} action={transitionReservationStatusAction.bind(null, reservation.id, nextStatus)}><button className={nextStatus === 'cancelled' || nextStatus === 'rejected' || nextStatus === 'no_show' ? 'danger-button' : 'outline-button'}>{labels[nextStatus]}</button></form>)}</div></section>}{canCancel && <form className="resource-actions" action={cancelReservationAction.bind(null, reservation.id)}><button className="danger-button">Cancel reservation</button></form>}<section className="detail-card reservation-detail"><h2>Activity history</h2>{activity.length === 0 ? <p className="detail-muted">No activity recorded yet.</p> : <ul className="resource-history">{activity.map(entry => <li key={entry.id}><span>{activityLabel(entry)}</span><span>{formatDate(entry.createdAt)}</span></li>)}</ul>}</section></main>
}
