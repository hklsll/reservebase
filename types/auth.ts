export type AppRole = 'admin' | 'staff' | 'member'

export type Permission = 'manage_members' | 'manage_resources' | 'manage_reservations' | 'view_reports'

export type OrganizationMembership = {
  organizationId: string
  organizationName: string
  role: AppRole
  user: { id: string; email: string | null; fullName: string | null }
}
