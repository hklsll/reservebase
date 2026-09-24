'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { archiveResource, createResource, getResource, updateResource } from '@/lib/resources/resource-service'
import { resourceConditions, resourceStatuses, type ResourceInput } from '@/types/resource'

export type ResourceFormState = { error: string | null }

function stringValue(formData: FormData, field: string, maxLength: number, required = false) {
  const value = String(formData.get(field) ?? '').trim()
  if (required && !value) throw new Error(`${field} is required.`)
  if (value.length > maxLength) throw new Error(`${field} is too long.`)
  return value || null
}

function parseResource(formData: FormData): ResourceInput {
  const name = stringValue(formData, 'name', 160, true)!
  const category = stringValue(formData, 'category', 80, true)!
  const location = stringValue(formData, 'location', 120, true)!
  const quantity = Number(formData.get('quantity'))
  const availableQuantity = Number(formData.get('availableQuantity'))
  const status = String(formData.get('status'))
  const condition = String(formData.get('condition'))
  const imageUrl = stringValue(formData, 'imageUrl', 2048)
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(availableQuantity) || availableQuantity < 0 || availableQuantity > quantity) throw new Error('Quantity and available quantity are invalid.')
  if (!resourceStatuses.includes(status as ResourceInput['status']) || status === 'retired') throw new Error('Resource status is invalid.')
  if (!resourceConditions.includes(condition as ResourceInput['condition'])) throw new Error('Resource condition is invalid.')
  if (imageUrl) { try { new URL(imageUrl) } catch { throw new Error('Image URL is invalid.') } }
  return { name, category, location, quantity, availableQuantity, status: status as ResourceInput['status'], condition: condition as ResourceInput['condition'], description: stringValue(formData, 'description', 4000), assetCode: stringValue(formData, 'assetCode', 80), imageUrl, notes: stringValue(formData, 'notes', 4000) }
}

async function requireResourceManager() {
  const membership = await requireMembership()
  if (!hasPermission(membership.role, 'manage_resources')) throw new Error('You do not have permission to manage resources.')
  return membership
}

export async function createResourceAction(_: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  const membership = await requireResourceManager()
  let resourceId: string
  try {
    resourceId = await createResource(membership.organizationId, parseResource(formData))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to create resource.' }
  }
  revalidatePath('/resources')
  redirect(`/resources/${resourceId}`)
}

export async function updateResourceAction(resourceId: string, _: ResourceFormState, formData: FormData): Promise<ResourceFormState> {
  await requireResourceManager()
  try {
    const resource = await getResource(resourceId)
    if (!resource) return { error: 'Resource not found.' }
    await updateResource(resourceId, parseResource(formData))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update resource.' }
  }
  revalidatePath('/resources')
  revalidatePath(`/resources/${resourceId}`)
  redirect(`/resources/${resourceId}`)
}

export async function archiveResourceAction(resourceId: string) {
  await requireResourceManager()
  const resource = await getResource(resourceId)
  if (!resource) throw new Error('Resource not found.')
  await archiveResource(resourceId)
  revalidatePath('/resources')
  redirect('/resources')
}
