import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import test from 'node:test'
import {
  installmentsForAmount,
  normalizePaymentStatus,
  parseGiftPaymentInput,
  paymentMatchesPurchase,
  verifyWebhookSignature,
} from './giftPaymentUtils.js'

test('validates checkout details and the message limit', () => {
  const input = parseGiftPaymentInput({
    giftId: randomUUID(),
    idempotencyKey: randomUUID(),
    guestName: '  Convidado  ',
    message: '  Obrigado!  ',
  })

  assert.equal(input.guestName, 'Convidado')
  assert.equal(input.message, 'Obrigado!')
  assert.equal(parseGiftPaymentInput({
    giftId: randomUUID(),
    idempotencyKey: randomUUID(),
    guestName: 'Convidado',
    message: 'a'.repeat(300),
  }).message.length, 300)
})

test('rejects missing names, invalid gift ids, and messages over 300 characters', () => {
  const valid = { giftId: randomUUID(), idempotencyKey: randomUUID(), guestName: 'Convidado' }
  assert.throws(() => parseGiftPaymentInput({ ...valid, guestName: ' ' }))
  assert.throws(() => parseGiftPaymentInput({ ...valid, giftId: 'jantar-romantico' }))
  assert.throws(() => parseGiftPaymentInput({ ...valid, message: 'a'.repeat(301) }))
})

test('preserves the installment thresholds', () => {
  assert.equal(installmentsForAmount(99.99), 1)
  assert.equal(installmentsForAmount(100), 2)
  assert.equal(installmentsForAmount(249.99), 2)
  assert.equal(installmentsForAmount(250), 3)
  assert.throws(() => installmentsForAmount(0))
})

test('matches a verified Mercado Pago payment to the stored purchase', () => {
  const purchase = { idempotency_key: 'checkout-1', amount: '180.00', preference_id: 'pref-1' }
  const payment = {
    external_reference: 'checkout-1',
    transaction_amount: 180,
    currency_id: 'BRL',
    preference_id: 'pref-1',
  }
  assert.equal(paymentMatchesPurchase(payment, purchase), true)
  assert.equal(paymentMatchesPurchase({ ...payment, transaction_amount: 10 }, purchase), false)
  assert.equal(paymentMatchesPurchase({ ...payment, external_reference: 'other' }, purchase), false)
  assert.equal(paymentMatchesPurchase(payment, { ...purchase, preference_id: null }), true)
})

test('verifies webhook signatures and rejects tampered or incomplete data', () => {
  const secret = 'test-webhook-secret'
  const requestId = 'request-123'
  const dataId = 'Payment-456'
  const ts = '1710000000'
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`

  assert.equal(verifyWebhookSignature({ signature, requestId, dataId, secret }), true)
  assert.equal(verifyWebhookSignature({ signature, requestId: 'wrong', dataId, secret }), false)
  assert.equal(verifyWebhookSignature({ signature, requestId, dataId, secret: '' }), false)
})

test('maps unknown payment statuses conservatively', () => {
  assert.equal(normalizePaymentStatus('approved'), 'approved')
  assert.equal(normalizePaymentStatus('in_process'), 'in_process')
  assert.equal(normalizePaymentStatus('expired'), 'expired')
  assert.equal(normalizePaymentStatus('unexpected'), 'unknown')
})