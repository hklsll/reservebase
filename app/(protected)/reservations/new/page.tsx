import Link from 'next/link'
import { ReservationForm } from '@/components/reservations/reservation-form'
import { EmptyState } from '@/components/shared/data-state'
import { requireMembership } from '@/lib/auth/require-membership'
import { listResources } from '@/lib/resources/resource-service'

export default async function NewReservationPage() {
  const membership = await requireMembership()
  const resources = (await listResources(membership.organizationId)).filter(resource => resource.status === 'available' && resource.availableQuantity > 0)
  return <main className="resources-page"><Link className="back-link" href="/reservations">← Reservations</Link><div className="resources-heading"><div><p className="eyebrow">New reservation</p><h1>Reserve a resource</h1><p>Choose a future time and we&apos;ll check live availability before submission.</p></div></div><div className="reservation-form-wrap">{resources.length === 0 ? <EmptyState title="No reservable resources" description="Ask a staff member to make a resource available first." /> : <ReservationForm resources={resources} />}</div></main>
}
