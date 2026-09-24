export const resourceStatuses = ['available', 'reserved', 'checked_out', 'maintenance', 'unavailable', 'retired'] as const
export type ResourceStatus = typeof resourceStatuses[number]

export const resourceConditions = ['excellent', 'good', 'fair', 'poor', 'unknown'] as const
export type ResourceCondition = typeof resourceConditions[number]

export type Resource = {
  id: string
  organizationId: string
  name: string
  category: string
  description: string | null
  quantity: number
  availableQuantity: number
  location: string
  condition: ResourceCondition
  status: ResourceStatus
  assetCode: string | null
  imageUrl: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ResourceInput = Omit<Resource, 'id' | 'organizationId' | 'archivedAt' | 'createdAt' | 'updatedAt'>
