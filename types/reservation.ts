export const reservationStatuses = ['pending', 'approved', 'rejected', 'reserved', 'checked_out', 'returned', 'cancelled', 'overdue', 'no_show'] as const
export type ReservationStatus = typeof reservationStatuses[number]

export type Reservation = {
  id: string
  organizationId: string
  resourceId: string
  resourceName: string
  requestedBy: string
  requestedByName?: string | null
  startsAt: string
  endsAt: string
  quantity: number
  purpose: string
  notes: string | null
  status: ReservationStatus
  actualCheckoutAt: string | null
  checkedOutBy: string | null
  receivedBy: string | null
  conditionOut: import('@/types/resource').ResourceCondition | null
  checkoutNotes: string | null
  actualReturnedAt: string | null
  returnedBy: string | null
  conditionIn: import('@/types/resource').ResourceCondition | null
  returnNotes: string | null
  isOverdue: boolean
  createdAt: string
  updatedAt: string
}

export type ReservationInput = {
  resourceId: string
  startsAt: string
  endsAt: string
  quantity: number
  purpose: string
  notes: string | null
}

export type ReservationActivity = {
  id: string
  kind: 'requested' | 'status_changed' | 'checked_out' | 'returned'
  previousStatus: ReservationStatus | null
  nextStatus: ReservationStatus | null
  createdAt: string
}
