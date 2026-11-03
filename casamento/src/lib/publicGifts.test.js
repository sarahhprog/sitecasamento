import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchPublicGifts } from './publicGifts.js'

function createSupabase(result, expectedRange = [0, 11]) {
  const query = {
    from(table) {
      assert.equal(table, 'gifts')
      return this
    },
    select(columns, options) {
      assert.match(columns, /available/)
      assert.deepEqual(options, { count: 'exact' })
      return this
    },
    eq(column, value) {
      assert.equal(column, 'public_visible')
      assert.equal(value, true)
      return this
    },
    order(column, options) {
      assert.equal(column, 'created_at')
      assert.deepEqual(options, { ascending: true })
      return this
    },
    range(start, end) {
      assert.deepEqual([start, end], expectedRange)
      return this
    },
    abortSignal(signal) {
      this.signal = signal
      return this
    },
    then(resolve, reject) {
      return Promise.resolve(typeof result === 'function' ? result(this.signal) : result)
        .then(resolve, reject)
    },
  }

  return { from: query.from.bind(query) }
}

test('returns public gifts and the exact count', async () => {
  const gifts = [{ id: 'gift-1', name: 'Jantar', available: true }]
  const result = await fetchPublicGifts(createSupabase({ data: gifts, count: 1, error: null }), 1)

  assert.deepEqual(result, { gifts, count: 1 })
})

test('returns an empty list distinctly from an error', async () => {
  const result = await fetchPublicGifts(createSupabase({ data: [], count: 0, error: null }), 1)

  assert.deepEqual(result, { gifts: [], count: 0 })
})

test('uses the requested page range', async () => {
  const result = await fetchPublicGifts(
    createSupabase({ data: [], count: 12, error: null }, [12, 23]),
    2
  )

  assert.equal(result.count, 12)
})

test('rejects network failures instead of treating them as an empty list', async () => {
  const networkError = new TypeError('Failed to fetch')
  await assert.rejects(
    fetchPublicGifts(createSupabase(() => { throw networkError }), 1),
    (error) => error === networkError
  )
})

test('rejects Supabase permission errors instead of treating them as an empty list', async () => {
  const permissionError = { code: '42501', message: 'permission denied' }
  await assert.rejects(
    fetchPublicGifts(createSupabase({
      data: null,
      count: null,
      error: permissionError,
    }), 1),
    (error) => error === permissionError
  )
})

test('aborts and reports a stalled Supabase query after the timeout', async () => {
  const supabase = createSupabase((signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))

  await assert.rejects(
    fetchPublicGifts(supabase, 1, 5),
    /excedeu o tempo limite/
  )
})
