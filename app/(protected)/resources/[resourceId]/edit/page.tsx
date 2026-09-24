import { notFound, redirect } from 'next/navigation'
import { ResourceForm } from '@/components/resources/resource-form'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { getResource } from '@/lib/resources/resource-service'
import { updateResourceAction } from '../../actions'

export default async function EditResourcePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params
  const membership = await requireMembership()
  if (!hasPermission(membership.role, 'manage_resources')) redirect(`/resources/${resourceId}`)
  const resource = await getResource(resourceId)
  if (!resource || resource.organizationId !== membership.organizationId || resource.archivedAt) notFound()
  return <main className="resources-page"><div className="resources-heading"><div><p className="eyebrow">Edit resource</p><h1>{resource.name}</h1><p>Update resource information and availability.</p></div></div><ResourceForm resource={resource} action={updateResourceAction.bind(null, resource.id)} submitLabel="Save changes" /></main>
}
