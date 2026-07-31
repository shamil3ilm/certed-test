let fallbackSequence = 0

function fallbackEntropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(2)
    crypto.getRandomValues(values)
    return `${values[0].toString(36)}${values[1].toString(36)}`
  }

  fallbackSequence += 1
  return `${Date.now().toString(36)}-${fallbackSequence.toString(36)}`
}

export function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${fallbackEntropy()}`
}
