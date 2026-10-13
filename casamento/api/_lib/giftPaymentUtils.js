import { createHmac, timingSafeEqual } from 'node:crypto'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KNOWN_PAYMENT_STATUSES = new Set([
  'approved',
  'pending',
  'in_process',
  'rejected',
  'cancelled',
  'expired',
  'refunded',
  'charged_back',
  'in_mediation',
])

export function parseGiftPaymentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Dados do presente inválidos.')
  }

  const giftId = typeof body.giftId === 'string' ? body.giftId.trim() : ''
  const idempotencyKey = typeof body.idempotencyKey === 'string'
    ? body.idempotencyKey.trim()
    : ''
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!UUID_PATTERN.test(giftId)) throw new Error('Presente inválido.')
  if (!UUID_PATTERN.test(idempotencyKey)) throw new Error('Identificador da solicitação inválido.')
  if (guestName.length < 1 || guestName.length > 120) {
    throw new Error('Informe um nome de até 120 caracteres.')
  }
  if (typeof body.message !== 'undefined' && body.message !== null && typeof body.message !== 'string') {
    throw new Error('Mensagem inválida.')
  }
  if (message.length > 300) throw new Error('A mensagem deve ter no máximo 300 caracteres.')

  return { giftId, idempotencyKey, guestName, message: message || null }
}

export function installmentsForAmount(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Valor do presente inválido.')
  if (value >= 250) return 3
  if (value >= 100) return 2
  return 1
}

export function normalizePaymentStatus(status) {
  return KNOWN_PAYMENT_STATUSES.has(status) ? status : 'unknown'
}

export function paymentMatchesPurchase(payment, purchase) {
  const paymentAmount = Number(payment?.transaction_amount)
  const purchaseAmount = Number(purchase?.amount)
  return String(payment?.external_reference || '') === String(purchase?.idempotency_key || '')
    && payment?.currency_id === 'BRL'
    && Number.isFinite(paymentAmount)
    && Math.round(paymentAmount * 100) === Math.round(purchaseAmount * 100)
    && (!purchase?.preference_id
      || String(payment?.preference_id || '') === String(purchase.preference_id))
}

export function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  if (!signature || !requestId || !dataId || !secret) return false

  const parts = Object.fromEntries(
    String(signature).split(',').map((part) => {
      const [key, ...value] = part.trim().split('=')
      return [key, value.join('=')]
    }),
  )
  if (!/^\d+$/.test(parts.ts || '') || !/^[a-f\d]{64}$/i.test(parts.v1 || '')) return false

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest()
  const supplied = Buffer.from(parts.v1, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}