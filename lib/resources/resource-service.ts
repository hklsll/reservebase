import { createClient } from '@/lib/supabase/server'
import type { Resource, ResourceInput, ResourceStatus } from '@/types/resource'

type ResourceRow = {
  id: string; organization_id: string; name: string; category: string; description: string | null; quantity: number; available_quantity: number; location: string; condition: Resource['condition']; status: ResourceStatus; asset_code: string | null; image_url: string | null; notes: string | null; archived_at: string | null; created_at: string; updated_at: string
}

const selectColumns = 'id, organization_id, name, category, description, quantity, available_quantity, location, condition, status, asset_code, image_url, notes, archived_at, created_at, updated_at'
export const RESOURCE_PAGE_SIZE = 50

function toResource(row: ResourceRow): Resource {
  return { id: row.id, organizationId: row.organization_id, name: row.name, category: row.category, description: row.description, quantity: row.quantity, availableQuantity: row.available_quantity, location: row.location, condition: row.condition, status: row.status, assetCode: row.asset_code, imageUrl: row.image_url, notes: row.notes, archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at }
}

export async function listResources(organizationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').select(selectColumns).eq('organization_id', organizationId).is('archived_at', null).order('name')
  if (error) throw new Error('Unable to load resources.')
  return (data as ResourceRow[]).map(toResource)
}

export async function listResourcesPage(organizationId: string, page = 1, pageSize = RESOURCE_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const supabase = await createClient()
  const from = (safePage - 1) * safePageSize
  const { data, error } = await supabase.from('resources').select(selectColumns).eq('organization_id', organizationId).is('archived_at', null).order('name').range(from, from + safePageSize)
  if (error) throw new Error('Unable to load resources.')
  const rows = (data as ResourceRow[]) ?? []
  return { resources: rows.slice(0, safePageSize).map(toResource), hasNextPage: rows.length > safePageSize, page: safePage }
}

export async function getResource(resourceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').select(selectColumns).eq('id', resourceId).maybeSingle()
  if (error) throw new Error('Unable to load this resource.')
  return data ? toResource(data as ResourceRow) : null
}

export async function createResource(organizationId: string, input: ResourceInput) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').insert({ organization_id: organizationId, name: input.name, category: input.category, description: input.description, quantity: input.quantity, available_quantity: input.availableQuantity, location: input.location, condition: input.condition, status: input.status, asset_code: input.assetCode, image_url: input.imageUrl, notes: input.notes }).select('id').single()
  if (error) throw new Error('Unable to create this resource.')
  return data.id as string
}

export async function updateResource(resourceId: string, input: ResourceInput) {
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ name: input.name, category: input.category, description: input.description, quantity: input.quantity, available_quantity: input.availableQuantity, location: input.location, condition: input.condition, status: input.status, asset_code: input.assetCode, image_url: input.imageUrl, notes: input.notes }).eq('id', resourceId)
  if (error) throw new Error('Unable to update this resource.')
}

export async function archiveResource(resourceId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status: 'retired', available_quantity: 0, archived_at: new Date().toISOString() }).eq('id', resourceId)
  if (error) throw new Error('Unable to archive this resource.')
}
