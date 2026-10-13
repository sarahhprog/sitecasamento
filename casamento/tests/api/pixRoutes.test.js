import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import reservePix from '../../api/presentes/pix/reservar.js'
import requestPixConfirmation from '../../api/presentes/pix/solicitar-confirmacao.js'
import { copyPixKeyToClipboard } from '../../src/lib/pix.js'

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function withServerEnvironment(run) {
  const names = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [name, value] of Object.entries(original)) {
        if (typeof value === 'undefined') delete process.env[name]
        else process.env[name] = value
      }
    })
}

const giftId = '123e4567-e89b-42d3-a456-426614174000'
const idempotencyKey = '123e4567-e89b-42d3-a456-426614174001'

test('does not create a reservation or return PIX details when no key is configured', async () => {
  await withServerEnvironment(async () => {
    const response = createResponse()
    let rpcCalled = false
    await reservePix({
      method: 'POST',
      body: { giftId, idempotencyKey, guestName: 'Convidada' },
    }, response, {
      getSupabaseAdmin: () => ({
        from: () => ({
          select() { return this },
          in: async () => ({
            data: [{ key: 'pix_recipient_name', value: 'Hayato Miyata Rocha' }],
            error: null,
          }),
        }),
        rpc: async () => {
          rpcCalled = true
          return { data: [], error: null }
        },
      }),
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.body.code, 'PIX_NOT_CONFIGURED')
    assert.equal(rpcCalled, false)
  })
})

test('reserves PIX using the server RPC and the server-returned gift snapshot', async () => {
  await withServerEnvironment(async () => {
    const response = createResponse()
    let rpcCall
    await reservePix({
      method: 'POST',
      body: { giftId, idempotencyKey, guestName: 'Convidada', message: 'Com carinho' },
    }, response, {
      getSupabaseAdmin: () => ({
        from: () => ({
          select() { return this },
          in: async () => ({
            data: [
              { key: 'pix_key', value: 'pix@example.com' },
              { key: 'pix_recipient_name', value: 'Hayato Miyata Rocha' },
            ],
            error: null,
          }),
        }),
        rpc: async (name, parameters) => {
          rpcCall = { name, parameters }
          return {
            data: [{
              idempotency_key: idempotencyKey,
              gift_name: 'Jantar especial',
              amount: 180,
              reservation_expires_at: '2026-10-14T12:00:00.000Z',
            }],
            error: null,
          }
        },
      }),
    })

    assert.equal(response.statusCode, 201)
    assert.equal(rpcCall.name, 'reserve_gift_payment')
    assert.equal(rpcCall.parameters.p_payment_method, 'pix')
    assert.equal(response.body.gift_name, 'Jantar especial')
    assert.equal(response.body.amount, 180)
    assert.equal(response.body.pix_key, 'pix@example.com')
    assert.equal(response.body.recipient_name, 'Hayato Miyata Rocha')
  })
})

test('a guest payment-completed request records only an administrative review request', async () => {
  await withServerEnvironment(async () => {
    const response = createResponse()
    const calls = []
    await requestPixConfirmation({
      method: 'POST',
      body: { idempotencyKey },
    }, response, {
      getSupabaseAdmin: () => ({
        rpc: async (name, parameters) => {
          calls.push({ name, parameters })
          return { data: 'requested', error: null }
        },
      }),
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.status, 'requested')
    assert.match(response.body.message, /verificação/)
    assert.deepEqual(calls, [{
      name: 'request_pix_confirmation',
      parameters: { p_idempotency_key: idempotencyKey },
    }])
  })
})

test('expired PIX reservation is not reported as submitted', async () => {
  await withServerEnvironment(async () => {
    const response = createResponse()
    await requestPixConfirmation({
      method: 'POST',
      body: { idempotencyKey },
    }, response, {
      getSupabaseAdmin: () => ({
        rpc: async () => ({ data: 'expired', error: null }),
      }),
    })
    assert.equal(response.statusCode, 410)
    assert.equal(response.body.status, 'expired')
  })
})

test('copies a PIX key with the browser clipboard API', async () => {
  const copied = []
  await copyPixKeyToClipboard('pix@example.com', {
    writeText: async (value) => copied.push(value),
  })
  assert.deepEqual(copied, ['pix@example.com'])
})

test('rejects empty or unsupported clipboard inputs', async () => {
  await assert.rejects(copyPixKeyToClipboard('', { writeText: async () => {} }), /chave PIX/)
  await assert.rejects(copyPixKeyToClipboard('pix@example.com', null), /navegador/)
})

test('migration gates administrative actions and locks the gift before confirmation', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261014100000_manual_pix_and_gift_controls.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /admin_review_pix_payment[\s\S]*auth\.role\(\)[\s\S]*is_wedding_admin/i)
  assert.match(migration, /admin_set_gift_availability[\s\S]*auth\.role\(\)[\s\S]*is_wedding_admin/i)
  assert.match(migration, /select \* into gift_row from public\.gifts where id = payment_row\.gift_id for update/i)
  assert.match(migration, /reservation_payment_key is distinct from p_idempotency_key/i)
  assert.match(migration, /manual_availability_override/i)
  assert.match(migration, /gift_payment_events/i)
})
