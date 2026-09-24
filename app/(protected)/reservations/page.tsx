import Link from 'next/link'
import { ReservationList } from '@/components/reservations/reservation-list'
import { Pagination } from '@/components/shared/pagination'
import { requireMembership } from '@/lib/auth/require-membership'
import { listReservationsPage } from '@/lib/reservations/reservation-service'

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const membership = await requireMembership()
  const params = await searchParams
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  const result = await listReservationsPage(membership.organizationId, page)
  return <main className="resources-page"><div className="resources-heading"><div><p className="eyebrow">{membership.organizationName}</p><h1>Reservations</h1><p>View and manage your upcoming resource reservations.</p></div><Link className="primary-button" href="/reservations/new">New reservation</Link></div><div className="reservation-list-wrap"><ReservationList reservations={result.reservations} /></div><Pagination basePath="/reservations" page={result.page} hasNextPage={result.hasNextPage} /></main>
}
