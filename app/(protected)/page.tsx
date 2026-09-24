import { Dashboard } from '@/components/dashboard/dashboard'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission, roleLabel } from '@/lib/auth/roles'
import { getDashboardData } from '@/lib/services/dashboard-service'
import { signOut } from './actions'

export default async function Page() {
  const membership = await requireMembership()
  const dashboard = await getDashboardData({
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    user: {
      name: membership.user.fullName ?? membership.user.email ?? 'ReserveBase member',
      initials: (membership.user.fullName ?? membership.user.email ?? 'RB').split(/\s|@/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      role: roleLabel(membership.role),
    },
  })

  return <Dashboard data={dashboard} signOutAction={signOut} canManageResources={hasPermission(membership.role, 'manage_resources')} />
}
