import assert from 'node:assert/strict'
import test from 'node:test'
import { getSiteUrl } from './siteUrl.js'

test('prefers explicit SITE_URL and normalizes it to an origin', () => {
  assert.equal(getSiteUrl({
    SITE_URL: 'https://wedding.example/path',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'stable.vercel.app',
    VERCEL_URL: 'deployment.vercel.app',
  }), 'https://wedding.example')
})

test('uses the stable production Vercel hostname before the deployment hostname', () => {
  assert.equal(getSiteUrl({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'sitecasamento-ebon.vercel.app',
    VERCEL_URL: 'sitecasamento-random-deployment.vercel.app',
  }), 'https://sitecasamento-ebon.vercel.app')
})

test('uses VERCEL_URL for previews and returns null when no host exists', () => {
  assert.equal(getSiteUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'preview-branch.vercel.app',
  }), 'https://preview-branch.vercel.app')
  assert.equal(getSiteUrl({ VERCEL_ENV: 'production' }), null)
})

test('rejects unsupported protocols', () => {
  assert.equal(getSiteUrl({ SITE_URL: 'javascript:alert(1)' }), null)
})
