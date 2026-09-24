import { createClient } from '@/lib/supabase/server'
import type { Reservation, ReservationActivity, ReservationInput, ReservationStatus } from '@/types/reservation'
import type { ResourceCondition } from '@/types/resource'

type ReservationRow = {
  id: string
  organization_id: string
  resource_id: string
  requested_by: string
  starts_at: string
  ends_at: string
  quantity: number
  purpose: string
  notes: string | null
  status: ReservationStatus
  actual_checkout_at: string | null
  checked_out_by: string | null
  received_by: string | null
  condition_out: ResourceCondition | null
  checkout_notes: string | null
  actual_returned_at: string | null
  returned_by: string | null
  condition_in: ResourceCondition | null
  return_notes: string | null
  created_at: string
  updated_at: string
  resources: { name: string } | { name: string }[] | null
}

const selectColumns = 'id, organization_id, resource_id, requested_by, starts_at, ends_at, quantity, purpose, notes, status, actual_checkout_at, checked_out_by, received_by, condition_out, checkout_notes, actual_returned_at, returned_by, condition_in, return_notes, created_at, updated_at, resources(name)'
export const RESERVATION_PAGE_SIZE = 50

function toReservation(row: ReservationRow): Reservation {
  const resource = Array.isArray(row.resources) ? row.resources[0] : row.resources
  return { id: row.id, organizationId: row.organization_id, resourceId: row.resource_id, resourceName: resource?.name ?? 'Archived resource', requestedBy: row.requested_by, startsAt: row.starts_at, endsAt: row.ends_at, quantity: row.quantity, purpose: row.purpose, notes: row.notes, status: row.status, actualCheckoutAt: row.actual_checkout_at, checkedOutBy: row.checked_out_by, receivedBy: row.received_by, conditionOut: row.condition_out, checkoutNotes: row.checkout_notes, actualReturnedAt: row.actual_returned_at, returnedBy: row.returned_by, conditionIn: row.condition_in, returnNotes: row.return_notes, isOverdue: row.status === 'checked_out' && new Date(row.ends_at).getTime() < Date.now(), createdAt: row.created_at, updatedAt: row.updated_at }
}

async function addRequesterNames(reservations: Reservation[]) {
  const userIds = [...new Set(reservations.map(reservation => reservation.requestedBy))]
  if (userIds.length === 0) return reservations
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
  const names = new Map((data ?? []).map(profile => [profile.id as string, (profile.full_name as string | null) ?? null]))
  return reservations.map(reservation => ({ ...reservation, requestedByName: names.get(reservation.requestedBy) ?? null }))
}

export async function listReservations(organizationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').select(selectColumns).eq('organization_id', organizationId).order('starts_at', { ascending: true })
  if (error) throw new Error('Unable to load reservations.')
  return addRequesterNames((data as ReservationRow[]).map(toReservation))
}

export async function listReservationsPage(organizationId: string, page = 1, pageSize = RESERVATION_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const supabase = await createClient()
  const from = (safePage - 1) * safePageSize
  const { data, error } = await supabase.from('reservations').select(selectColumns).eq('organization_id', organizationId).order('starts_at', { ascending: true }).range(from, from + safePageSize)
  if (error) throw new Error('Unable to load reservations.')
  const rows = (data as ReservationRow[]) ?? []
  const reservations = await addRequesterNames(rows.slice(0, safePageSize).map(toReservation))
  return { reservations, hasNextPage: rows.length > safePageSize, page: safePage }
}

export async function listResourceReservations(resourceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').select(selectColumns).eq('resource_id', resourceId).order('starts_at', { ascending: false }).limit(50)
  if (error) throw new Error('Unable to load reservation history.')
  return (data as ReservationRow[]).map(toReservation)
}

export async function getReservation(reservationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').select(selectColumns).eq('id', reservationId).maybeSingle()
  if (error) throw new Error('Unable to load this reservation.')
  return data ? toReservation(data as ReservationRow) : null
}

export async function checkResourceAvailability(resourceId: string, startsAt: string, endsAt: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_resource_availability', { p_resource_id: resourceId, p_starts_at: startsAt, p_ends_at: endsAt })
  if (error) throw new Error(error.message || 'Unable to check availability.')
  return Number(data)
}

export async function createReservation(organizationId: string, userId: string, input: ReservationInput) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').insert({ organization_id: organizationId, resource_id: input.resourceId, requested_by: userId, starts_at: input.startsAt, ends_at: input.endsAt, quantity: input.quantity, purpose: input.purpose, notes: input.notes }).select('id').single()
  if (error) throw new Error(error.message || 'Unable to submit this reservation.')
  return data.id as string
}

export async function cancelReservation(reservationId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_my_reservation', { p_reservation_id: reservationId })
  if (error) throw new Error(error.message || 'Unable to cancel this reservation.')
}

export async function updateReservationStatus(reservationId: string, status: ReservationStatus) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').update({ status }).eq('id', reservationId).select('id').maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Unable to update this reservation.')
}

export async function recordCheckout(reservationId: string, staffId: string, input: { receivedBy: string; conditionOut: ResourceCondition; checkoutNotes: string | null }) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').update({ status: 'checked_out', actual_checkout_at: new Date().toISOString(), checked_out_by: staffId, received_by: input.receivedBy, condition_out: input.conditionOut, checkout_notes: input.checkoutNotes }).eq('id', reservationId).select('id').maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Unable to record check-out.')
}

export async function recordReturn(reservationId: string, staffId: string, input: { conditionIn: ResourceCondition; returnNotes: string | null }) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations').update({ status: 'returned', actual_returned_at: new Date().toISOString(), returned_by: staffId, condition_in: input.conditionIn, return_notes: input.returnNotes }).eq('id', reservationId).select('id').maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Unable to record return.')
}

type ActivityRow = { id: string; kind: ReservationActivity['kind']; previous_status: ReservationStatus | null; next_status: ReservationStatus | null; created_at: string }

export async function listReservationActivity(reservationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservation_activity').select('id, kind, previous_status, next_status, created_at').eq('reservation_id', reservationId).order('created_at')
  if (error) throw new Error('Unable to load reservation activity.')
  return (data as ActivityRow[]).map(activity => ({ id: activity.id, kind: activity.kind, previousStatus: activity.previous_status, nextStatus: activity.next_status, createdAt: activity.created_at }))
}
