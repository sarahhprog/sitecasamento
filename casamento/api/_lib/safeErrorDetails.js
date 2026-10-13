const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/

function safeIdentifier(value) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? value
    : null
}

export function safeErrorDetails(error) {
  const status = Number(error?.status ?? error?.statusCode)

  return {
    name: safeIdentifier(error?.name) || 'Error',
    code: safeIdentifier(error?.code) || safeIdentifier(error?.cause?.code) || 'UNKNOWN',
    status: Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : null,
  }
}
