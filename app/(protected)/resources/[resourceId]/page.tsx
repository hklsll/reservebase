import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { getResource } from '@/lib/resources/resource-service'
import { listResourceReservations } from '@/lib/reservations/reservation-service'
import { archiveResourceAction } from '../actions'

export default async function ResourceDetailPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params
  const membership = await requireMembership()
  const resource = await getResource(resourceId)
  if (!resource || resource.organizationId !== membership.organizationId || resource.archivedAt) notFound()

  const reservations = await listResourceReservations(resource.id)
  const canManage = hasPermission(membership.role, 'manage_resources')

  return <main className="resources-page"><Link className="back-link" href="/resources">← Resources</Link><div className="resource-detail-heading"><div><p className="eyebrow">{resource.category}</p><h1>{resource.name}</h1><p>{resource.assetCode ?? 'No asset code'} · {resource.location}</p></div><span className={`resource-status ${resource.status}`}>{resource.status.replaceAll('_', ' ')}</span></div><div className="resource-detail-grid"><section className="detail-card"><h2>Resource details</h2><dl><div><dt>Quantity</dt><dd>{resource.availableQuantity} available of {resource.quantity}</dd></div><div><dt>Condition</dt><dd>{resource.condition}</dd></div><div><dt>Description</dt><dd>{resource.description ?? 'No description added.'}</dd></div><div><dt>Notes</dt><dd>{resource.notes ?? 'No internal notes.'}</dd></div>{resource.imageUrl && <div><dt>Image</dt><dd><a href={resource.imageUrl} target="_blank" rel="noreferrer">Open image</a></dd></div>}</dl></section><section className="detail-card"><h2>Reservation history</h2>{reservations.length === 0 ? <p className="detail-muted">No reservations to show.</p> : <ul className="resource-history">{reservations.slice(0, 6).map(reservation => <li key={reservation.id}><Link href={`/reservations/${reservation.id}`}>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reservation.startsAt))}</Link><span>{reservation.quantity} unit{reservation.quantity === 1 ? '' : 's'} · {reservation.status.replaceAll('_', ' ')}</span></li>)}</ul>}</section></div>{canManage && <div className="resource-actions"><Link className="outline-button" href={`/resources/${resource.id}/edit`}>Edit resource</Link><form action={archiveResourceAction.bind(null, resource.id)}><button className="danger-button">Archive resource</button></form></div>}</main>
}
