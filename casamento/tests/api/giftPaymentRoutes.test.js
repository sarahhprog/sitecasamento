import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import createPreference from '../../api/mercado-pago/criar-preferencia.js'
import paymentStatus from '../../api/mercado-pago/status.js'
import webhook from '../../api/mercado-pago/webhook.js'

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

function createQuery(result, onUpdate = () => {}) {
  const query = {
    select() { return this },
    eq() { return this },
    insert() { return this },
    update(values) {
      onUpdate(values)
      return this
    },
    or(value) {
      onUpdate({ filter: value })
      return Promise.resolve(result)
    },
    maybeSingle() { return Promise.resolve(result) },
    single() { return Promise.resolve(result) },
  }
  return query
}

function createClient(queries = [], rpcResults = []) {
  return {
    from(table) {
      const next = queries.shift()
      assert.ok(next, `Unexpected query for ${table}`)
      return next
    },
    rpc(name, parameters) {
      assert.ok(rpcResults.length, `Unexpected RPC call to ${name}`)
      const next = rpcResults.shift()
      if (typeof next === 'function') return next(name, parameters)
      return Promise.resolve(next)
    },
  }
}

const giftId = '123e4567-e89b-42d3-a456-426614174000'
const purchaseId = '123e4567-e89b-42d3-a456-426614174001'

function setServerEnvironment(values) {
  const keys = [
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_WEBHOOK_SECRET',
    'SITE_URL',
    'VERCEL_URL',
  ]
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key]
    else delete process.env[key]
  }
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function validCheckoutBody(overrides = {}) {
  return {
    giftId,
    idempotencyKey: purchaseId,
    guestName: 'Convidado de teste',
    message: '',
    ...overrides,
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
  const restore = setServerEnvironment({})
  try {
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
    restore()
  }
})

test('rejects public or anon keys configured as the server key', async () => {
  const invalidKeys = [
    `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`,
    'sb_publishable_test-key',
  ]
  const log = console.error
  console.error = () => {}
  try {
    for (const key of invalidKeys) {
      const restore = setServerEnvironment({
        SUPABASE_SERVICE_ROLE_KEY: key,
        VITE_SUPABASE_URL: 'https://project.supabase.co',
        MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
        SITE_URL: 'https://wedding.example',
      })
      const response = createResponse()
      try {
        await createPreference({ method: 'POST', body: validCheckoutBody() }, response)
      } finally {
        restore()
      }
      assert.equal(response.statusCode, 503)
      assert.equal(response.body.code, 'SUPABASE_SERVER_CONFIGURATION')
    }
  } finally {
    console.error = log
  }
})

test('does not query Supabase for a malformed public status reference', async () => {
  const response = createResponse()
  await paymentStatus({ method: 'GET', query: { id: 'not-a-uuid' } }, response)

  assert.equal(response.statusCode, 400)
})

test('atomically reserves a gift and creates a preference using the server price', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const payment = {
    idempotency_key: purchaseId,
    gift_id: giftId,
    gift_name: 'Jantar especial',
    amount: 180,
    guest_name: 'Convidado de teste',
    message: null,
    payment_status: 'pending',
    reservation_expires_at: '2026-10-13T15:30:00.000Z',
    checkout_url: null,
    preference_id: null,
  }
  const updatedPayment = {
    idempotency_key: purchaseId,
    preference_id: 'preference-123',
    checkout_url: 'https://www.mercadopago.com/checkout/123',
  }
  let preferenceInput
  const queries = [
    createQuery({ data: updatedPayment, error: null }),
  ]
  const rpcResults = [
    Promise.resolve({ data: [payment], error: null }),
  ]
  const response = createResponse()
  try {
    await createPreference({
      method: 'POST',
      body: validCheckoutBody({ amount: 0.01 }),
    }, response, {
      getSupabaseAdmin: () => createClient(queries, rpcResults),
      createPreference: async (input) => {
        preferenceInput = input
        return { id: 'preference-123', init_point: updatedPayment.checkout_url }
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.init_point, updatedPayment.checkout_url)
  assert.equal(preferenceInput.body.items[0].unit_price, 180)
  assert.equal(preferenceInput.body.items[0].title, 'Jantar especial')
  assert.equal(preferenceInput.body.expiration_date_to, payment.reservation_expires_at)
  assert.equal(preferenceInput.idempotencyKey, purchaseId)
  assert.equal(queries.length, 0)
  assert.equal(rpcResults.length, 0)
})

test('identifies a reservation permission failure without claiming the payment table is missing', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  const log = console.error
  const logged = []
  console.error = (...args) => logged.push(args)
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: null, error: { code: '42501', message: 'private test detail' } }),
      ]),
    })
  } finally {
    console.error = log
    restore()
  }

  assert.equal(response.statusCode, 503)
  assert.equal(response.body.code, 'SUPABASE_GIFT_RESERVATION_FAILURE')
  assert.doesNotMatch(response.body.error, /migration/i)
  assert.equal(logged[0][1].stage, 'supabase_gift_reservation')
  assert.equal(logged[0][1].operation, 'reserve_gift_and_create_payment')
  assert.equal(logged[0][1].code, '42501')
  assert.equal(JSON.stringify(logged).includes('private test detail'), false)
})

test('reports a missing reservation function as a schema failure', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  const log = console.error
  console.error = () => {}
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: null, error: { code: 'PGRST202' } }),
      ]),
    })
  } finally {
    console.error = log
    restore()
  }

  assert.equal(response.statusCode, 503)
  assert.equal(response.body.code, 'SUPABASE_SCHEMA_FAILURE')
})

test('rejects an already reserved gift without creating a Mercado Pago preference', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  let preferenceCreated = false
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: [], error: null }),
      ]),
      createPreference: async () => {
        preferenceCreated = true
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'GIFT_UNAVAILABLE')
  assert.equal(preferenceCreated, false)
})

test('concurrent requests with the same idempotency key reuse the first checkout', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  let preferenceCreated = false
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: [{
            idempotency_key: purchaseId,
            gift_id: giftId,
            gift_name: 'Jantar especial',
            amount: 180,
            guest_name: 'Convidado de teste',
            message: null,
            preference_id: 'preference-123',
            checkout_url: 'https://www.mercadopago.com/checkout/123',
          }], error: null }),
      ]),
      createPreference: async () => {
        preferenceCreated = true
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.purchase_id, purchaseId)
  assert.equal(preferenceCreated, false)
})

test('reuses an existing checkout for duplicate idempotency keys', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  let preferenceCreated = false
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: [{
            idempotency_key: purchaseId,
            gift_id: giftId,
            gift_name: 'Jantar especial',
            amount: 180,
            guest_name: 'Convidado de teste',
            message: null,
            preference_id: 'preference-123',
            checkout_url: 'https://www.mercadopago.com/checkout/123',
          }], error: null }),
      ]),
      createPreference: async () => {
        preferenceCreated = true
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.purchase_id, purchaseId)
  assert.equal(preferenceCreated, false)
})

test('does not create or reopen a checkout after its payment is approved', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  let preferenceCreated = false
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: [{
            idempotency_key: purchaseId,
            gift_id: giftId,
            gift_name: 'Jantar especial',
            amount: 180,
            guest_name: 'Convidado de teste',
            message: null,
            payment_status: 'approved',
            preference_id: 'preference-123',
            checkout_url: 'https://www.mercadopago.com/checkout/123',
          }], error: null }),
      ]),
      createPreference: async () => {
        preferenceCreated = true
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 409)
  assert.equal(preferenceCreated, false)
})

test('returns a safe checkout failure when Mercado Pago returns an invalid preference', async () => {
  const restore = setServerEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
    SITE_URL: 'https://wedding.example',
  })
  const response = createResponse()
  const log = console.error
  console.error = () => {}
  try {
    await createPreference({ method: 'POST', body: validCheckoutBody() }, response, {
      getSupabaseAdmin: () => createClient([], [
        Promise.resolve({ data: [{
          idempotency_key: purchaseId,
          gift_id: giftId,
          gift_name: 'Presente',
          amount: 180,
          payment_status: 'pending',
          reservation_expires_at: '2026-10-13T15:30:00.000Z',
        }], error: null }),
      ]),
      createPreference: async () => ({ id: null, init_point: null }),
    })
  } finally {
    console.error = log
    restore()
  }

  assert.equal(response.statusCode, 502)
  assert.equal(response.body.code, 'MERCADOPAGO_PREFERENCE_FAILED')
})

test('returns the requested payment status without exposing the payment record', async () => {
  const response = createResponse()
  await paymentStatus({ method: 'GET', query: { id: purchaseId } }, response, {
    getSupabaseAdmin: () => createClient([
      createQuery({ data: { payment_status: 'approved' }, error: null }),
    ]),
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, { status: 'approved' })
})

function signedWebhookRequest(status = 'approved') {
  const secret = 'test-webhook-secret'
  const paymentId = 'payment-123'
  const requestId = 'request-123'
  const timestamp = '1791900000'
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`
  const digest = createHmac('sha256', secret).update(manifest).digest('hex')
  const purchase = {
    id: 'payment-row-123',
    idempotency_key: purchaseId,
    amount: '180.00',
    currency_id: 'BRL',
    preference_id: 'preference-123',
    mp_payment_updated_at: null,
    paid_at: null,
  }
  return {
    secret,
    purchase,
    request: {
      method: 'POST',
      body: { type: 'payment', data: { id: paymentId } },
      query: {},
      headers: {
        'x-signature': `ts=${timestamp},v1=${digest}`,
        'x-request-id': requestId,
      },
    },
    payment: {
      id: paymentId,
      status,
      external_reference: purchaseId,
      transaction_amount: 180,
      currency_id: 'BRL',
      preference_id: 'preference-123',
      date_last_updated: '2026-10-13T15:00:00.000Z',
      date_approved: status === 'approved' ? '2026-10-13T15:00:00.000Z' : null,
    },
  }
}

test('rejects invalid webhook signatures before contacting payment providers', async () => {
  const restore = setServerEnvironment({ MERCADOPAGO_WEBHOOK_SECRET: 'test-webhook-secret' })
  const input = signedWebhookRequest()
  input.request.headers['x-signature'] = 'ts=1,v1=invalid'
  const response = createResponse()
  let providerCalled = false
  try {
    await webhook(input.request, response, {
      getPayment: async () => {
        providerCalled = true
      },
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 401)
  assert.equal(providerCalled, false)
})

for (const status of ['approved', 'pending', 'in_process', 'rejected', 'cancelled', 'expired']) {
  test(`valid webhook safely updates the stored ${status} status`, async () => {
    const input = signedWebhookRequest(status)
    const restore = setServerEnvironment({
      MERCADOPAGO_WEBHOOK_SECRET: input.secret,
      MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      VITE_SUPABASE_URL: 'https://project.supabase.co',
    })
    const response = createResponse()
    let rpcName
    let rpcParameters
    const queries = [createQuery({ data: input.purchase, error: null })]
    try {
      await webhook(input.request, response, {
        getPayment: async () => input.payment,
        getSupabaseAdmin: () => createClient(queries, [
          (name, parameters) => {
            rpcName = name
            rpcParameters = parameters
            return Promise.resolve({ data: true, error: null })
          },
        ]),
      })
    } finally {
      restore()
    }

    assert.equal(response.statusCode, 200)
    assert.equal(rpcName, 'apply_gift_payment_status')
    assert.deepEqual(rpcParameters, {
      p_idempotency_key: purchaseId,
      p_payment_id: input.payment.id,
      p_payment_updated_at: input.payment.date_last_updated,
      p_payment_status: status,
      p_amount: 180,
      p_paid_at: input.payment.date_approved || null,
    })
  })
}

test('ignores webhook payments that do not match the stored amount', async () => {
  const input = signedWebhookRequest()
  input.payment.transaction_amount = 1
  const restore = setServerEnvironment({
    MERCADOPAGO_WEBHOOK_SECRET: input.secret,
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
  })
  const response = createResponse()
  let updateAttempted = false
  const log = console.error
  console.error = () => {}
  try {
    await webhook(input.request, response, {
      getPayment: async () => input.payment,
      getSupabaseAdmin: () => createClient(
        [createQuery({ data: input.purchase, error: null })],
        [() => {
          updateAttempted = true
          return Promise.resolve({ data: true, error: null })
        }],
      ),
    })
  } finally {
    console.error = log
    restore()
  }

  assert.equal(response.statusCode, 200)
  assert.equal(updateAttempted, false)
})

test('new migration grants the payment server only the gift columns it reads', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261013140000_grant_payment_api_gift_read.sql', import.meta.url),
    'utf8',
  )

  assert.match(
    migration,
    /grant select\s*\(id,\s*name,\s*value,\s*available,\s*public_visible\)\s*on public\.gifts to service_role;/i,
  )
  assert.doesNotMatch(migration, /grant\s+all/i)
})

test('webhook sends timestamps to the database function that serializes payment and gift updates', async () => {
  const input = signedWebhookRequest()
  input.purchase.mp_payment_updated_at = input.payment.date_last_updated
  const restore = setServerEnvironment({
    MERCADOPAGO_WEBHOOK_SECRET: input.secret,
    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
  })
  const response = createResponse()
  let rpcParameters
  try {
    await webhook(input.request, response, {
      getPayment: async () => input.payment,
      getSupabaseAdmin: () => createClient(
        [createQuery({ data: input.purchase, error: null })],
        [(name, parameters) => {
          assert.equal(name, 'apply_gift_payment_status')
          rpcParameters = parameters
          return Promise.resolve({ data: false, error: null })
        }],
      ),
    })
  } finally {
    restore()
  }

  assert.equal(response.statusCode, 200)
  assert.equal(rpcParameters.p_payment_updated_at, input.payment.date_last_updated)
})

test('reservation migration serializes checkout and keeps gift status separate from admin availability', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261013150000_gift_reservations.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /from public\.gifts\s+where id = p_gift_id\s+for update/i)
  assert.match(migration, /reservation_payment_key is distinct from p_idempotency_key/i)
  assert.match(migration, /gifted_payment_key = p_idempotency_key/i)
  assert.match(migration, /reservation_payment_key = p_idempotency_key/i)
  assert.match(migration, /payment_row\.mp_payment_updated_at is not null[\s\S]*p_payment_updated_at <= payment_row\.mp_payment_updated_at/i)
  assert.match(migration, /payment_row\.payment_status = 'approved'[\s\S]*p_payment_status in \('pending', 'in_process', 'rejected', 'cancelled'\)/i)
  assert.match(migration, /payment_row\.payment_status in \('rejected', 'cancelled', 'expired'\)[\s\S]*p_payment_status in \('pending', 'in_process'\)/i)
  assert.match(migration, /revoke all on function public\.reserve_gift_payment[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /revoke all on function public\.apply_gift_payment_status[\s\S]*from public, anon, authenticated/i)
})
