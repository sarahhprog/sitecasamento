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

test('does not query Supabase for a malformed public status reference', async () => {
  const response = createResponse()
  await paymentStatus({ method: 'GET', query: { id: 'not-a-uuid' } }, response)

  assert.equal(response.statusCode, 400)
})
