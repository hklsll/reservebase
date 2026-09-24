import { ResourceForm } from '@/components/resources/resource-form'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { createResourceAction } from '../actions'
import { redirect } from 'next/navigation'

export default async function NewResourcePage() {
  const membership = await requireMembership()
  if (!hasPermission(membership.role, 'manage_resources')) redirect('/resources')
  return <main className="resources-page"><div className="resources-heading"><div><p className="eyebrow">New resource</p><h1>Add resource</h1><p>Add operational details now; resource history will begin once reservations are introduced.</p></div></div><ResourceForm action={createResourceAction} submitLabel="Create resource" /></main>
}
