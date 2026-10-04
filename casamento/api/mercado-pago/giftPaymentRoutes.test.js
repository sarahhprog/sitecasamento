import assert from 'node:assert/strict'
import test from 'node:test'
import createPreference from './criar-preferencia.js'
import paymentStatus from './status.js'

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

test('rejects the legacy browser-supplied price payload', async () => {
  const response = createResponse()
  await createPreference({
    method: 'POST',
    body: { title: 'Presente falso', quantity: 1, unit_price: 0.01 },
  }, response)

  assert.equal(response.statusCode, 400)
  assert.match(response.body.error, /Presente inválido/)
})

test('rejects unsupported methods before accessing services', async () => {
  const response = createResponse()
  await createPreference({ method: 'GET' }, response)

  assert.equal(response.statusCode, 405)
})

test('reports missing server-side Supabase configuration without calling providers', async () => {
  const environmentKeys = [
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'SITE_URL',
    'VERCEL_URL',
  ]
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  )

  try {
    for (const key of environmentKeys) delete process.env[key]
    const response = createResponse()
    await createPreference({
      method: 'POST',
      body: {
        giftId: '123e4567-e89b-42d3-a456-426614174000',
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174001',
        guestName: 'Teste local',
        message: '',
      },
    }, response)

    assert.equal(response.statusCode, 503)
    assert.equal(response.body.code, 'SUPABASE_SERVER_CONFIGURATION')
  } finally {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('does not query Supabase for a malformed public status reference', async () => {
  const response = createResponse()
  await paymentStatus({ method: 'GET', query: { id: 'not-a-uuid' } }, response)

  assert.equal(response.statusCode, 400)
})
