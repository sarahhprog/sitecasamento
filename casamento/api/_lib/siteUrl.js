function toOrigin(value) {
  if (!value) return null
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`

  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null
  } catch {
    return null
  }
}

export function getSiteUrl(environment = process.env) {
  if (environment.SITE_URL) return toOrigin(environment.SITE_URL)

  const productionHost = environment.VERCEL_ENV === 'production'
    ? environment.VERCEL_PROJECT_PRODUCTION_URL
    : ''
  return toOrigin(productionHost || environment.VERCEL_URL)
}
