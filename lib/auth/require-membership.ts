import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, OrganizationMembership } from '@/types/auth'

export const getCurrentMembership = cache(async (): Promise<OrganizationMembership | null> => {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (claimsError || !userId) return null

  const [{ data: membership, error: membershipError }, { data: profile }] = await Promise.all([
    supabase.from('organization_members').select('organization_id, role, organizations(name)').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ])

  const organization = Array.isArray(membership?.organizations) ? membership.organizations[0] : membership?.organizations
  if (membershipError || !membership || !organization) return null

  return {
    organizationId: membership.organization_id,
    organizationName: organization.name,
    role: membership.role as AppRole,
    user: { id: userId, email: typeof claimsData.claims.email === 'string' ? claimsData.claims.email : null, fullName: profile?.full_name ?? null },
  }
})

export async function requireMembership() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/login')
  return membership
}
