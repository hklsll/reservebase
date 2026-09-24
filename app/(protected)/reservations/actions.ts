'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/require-membership'
import { hasPermission } from '@/lib/auth/roles'
import { cancelReservation, checkResourceAvailability, createReservation, getReservation, recordCheckout, recordReturn, updateReservationStatus } from '@/lib/reservations/reservation-service'
import { resourceConditions, type ResourceCondition } from '@/types/resource'
import { reservationStatuses, type ReservationInput, type ReservationStatus } from '@/types/reservation'

export type ReservationFormState = { error: string | null }
export type AvailabilityState = { error: string | null; availableQuantity: number | null }
export type CustodyFormState = { error: string | null }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function textValue(formData: FormData, field: string, maxLength: number, required = false) {
  const value = String(formData.get(field) ?? '').trim()
  if (required && !value) throw new Error(`${field} is required.`)
  if (value.length > maxLength) throw new Error(`${field} is too long.`)
  return value || null
}

function parseReservation(formData: FormData): ReservationInput {
  const resourceId = String(formData.get('resourceId') ?? '')
  const startsAt = String(formData.get('startsAt') ?? '')
  const endsAt = String(formData.get('endsAt') ?? '')
  const quantity = Number(formData.get('quantity'))
  const startDate = new Date(startsAt)
  const endDate = new Date(endsAt)

  if (!uuidPattern.test(resourceId)) throw new Error('Select a resource.')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new Error('Choose valid start and end times.')
  if (startDate <= new Date()) throw new Error('Reservations must start in the future.')
  if (endDate <= startDate) throw new Error('The end time must be after the start time.')
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Choose a valid quantity.')

  return { resourceId, startsAt: startDate.toISOString(), endsAt: endDate.toISOString(), quantity, purpose: textValue(formData, 'purpose', 500, true)!, notes: textValue(formData, 'notes', 4000) }
}

export async function checkReservationAvailabilityAction(_: AvailabilityState, formData: FormData): Promise<AvailabilityState> {
  await requireMembership()
  try {
    const reservation = parseReservation(formData)
    const availableQuantity = await checkResourceAvailability(reservation.resourceId, reservation.startsAt, reservation.endsAt)
    if (reservation.quantity > availableQuantity) return { error: `Only ${availableQuantity} unit${availableQuantity === 1 ? '' : 's'} are available for that time.`, availableQuantity }
    return { error: null, availableQuantity }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to check availability.', availableQuantity: null }
  }
}

export async function createReservationAction(_: ReservationFormState, formData: FormData): Promise<ReservationFormState> {
  const membership = await requireMembership()
  let reservationId: string
  try {
    reservationId = await createReservation(membership.organizationId, membership.user.id, parseReservation(formData))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to submit this reservation.' }
  }
  revalidatePath('/reservations')
  revalidatePath('/resources')
  redirect(`/reservations/${reservationId}?created=1`)
}

export async function cancelReservationAction(reservationId: string) {
  await requireMembership()
  await cancelReservation(reservationId)
  revalidatePath('/reservations')
  redirect('/reservations')
}

export async function transitionReservationStatusAction(reservationId: string, nextStatus: ReservationStatus) {
  const membership = await requireMembership()
  if (!hasPermission(membership.role, 'manage_reservations')) throw new Error('You do not have permission to update reservation status.')
  if (!reservationStatuses.includes(nextStatus)) throw new Error('Reservation status is invalid.')
  await updateReservationStatus(reservationId, nextStatus)
  revalidatePath('/reservations')
  revalidatePath(`/reservations/${reservationId}`)
  redirect(`/reservations/${reservationId}`)
}

function parseCondition(formData: FormData, field: string): ResourceCondition {
  const condition = String(formData.get(field) ?? '')
  if (!resourceConditions.includes(condition as ResourceCondition)) throw new Error('Choose a valid condition.')
  return condition as ResourceCondition
}

async function requireReservationManager() {
  const membership = await requireMembership()
  if (!hasPermission(membership.role, 'manage_reservations')) throw new Error('You do not have permission to manage reservations.')
  return membership
}

async function revalidateReservationPaths(reservationId: string) {
  const reservation = await getReservation(reservationId)
  revalidatePath('/reservations')
  revalidatePath('/reservations/' + reservationId)
  if (reservation) revalidatePath('/resources/' + reservation.resourceId)
}

export async function checkOutReservationAction(reservationId: string, _: CustodyFormState, formData: FormData): Promise<CustodyFormState> {
  const membership = await requireReservationManager()
  try {
    const receivedBy = textValue(formData, 'receivedBy', 160, true)!
    await recordCheckout(reservationId, membership.user.id, { receivedBy, conditionOut: parseCondition(formData, 'conditionOut'), checkoutNotes: textValue(formData, 'checkoutNotes', 4000) })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to record check-out.' }
  }
  await revalidateReservationPaths(reservationId)
  redirect('/reservations/' + reservationId)
}

export async function returnReservationAction(reservationId: string, _: CustodyFormState, formData: FormData): Promise<CustodyFormState> {
  const membership = await requireReservationManager()
  try {
    await recordReturn(reservationId, membership.user.id, { conditionIn: parseCondition(formData, 'conditionIn'), returnNotes: textValue(formData, 'returnNotes', 4000) })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to record return.' }
  }
  await revalidateReservationPaths(reservationId)
  redirect('/reservations/' + reservationId)
}
