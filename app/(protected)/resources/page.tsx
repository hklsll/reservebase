import { ResourceList } from '@/components/resources/resource-list'
import { Pagination } from '@/components/shared/pagination'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { listResourcesPage } from '@/lib/resources/resource-service'

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const membership = await requireMembership()
  const params = await searchParams
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  const result = await listResourcesPage(membership.organizationId, page)
  return <main className="resources-page"><div className="resources-heading"><div><p className="eyebrow">{membership.organizationName}</p><h1>Resources</h1><p>Manage equipment, availability, and asset information.</p></div></div><ResourceList resources={result.resources} canManageResources={hasPermission(membership.role, 'manage_resources')} /><Pagination basePath="/resources" page={result.page} hasNextPage={result.hasNextPage} /></main>
}
