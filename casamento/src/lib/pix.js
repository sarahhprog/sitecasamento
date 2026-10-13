export async function copyPixKeyToClipboard(pixKey, clipboard = globalThis.navigator?.clipboard) {
  if (typeof pixKey !== 'string' || !pixKey.trim()) {
    throw new Error('A chave PIX não está disponível para cópia.')
  }
  if (!clipboard?.writeText) {
    throw new Error('A cópia da chave PIX não está disponível neste navegador.')
  }
  await clipboard.writeText(pixKey)
}
