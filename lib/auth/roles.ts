import type { AppRole, Permission } from '@/types/auth'

const rolePermissions: Record<AppRole, readonly Permission[]> = {
  admin: ['manage_members', 'manage_resources', 'manage_reservations', 'view_reports'],
  staff: ['manage_resources', 'manage_reservations', 'view_reports'],
  member: [],
}

export function hasPermission(role: AppRole, permission: Permission) {
  return rolePermissions[role].includes(permission)
}

export function roleLabel(role: AppRole) {
  return role === 'admin' ? 'Administrator' : role === 'staff' ? 'Staff' : 'Member'
}
