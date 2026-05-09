interface DeriveKeyMessage {
  type: 'deriveKey'
  seed: string
  salt: string
  iterations: number
}

interface DeriveKeyResponse {
  type: 'deriveKeyResult'
  key: string
}

self.onmessage = async (e: MessageEvent<DeriveKeyMessage>) => {
  const { type, seed, salt, iterations } = e.data

  if (type === 'deriveKey') {
    try {
      const enc = new TextEncoder()
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(seed),
        'PBKDF2',
        false,
        ['deriveBits']
      )
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
        keyMaterial,
        256
      )
      const hex = Array.from(new Uint8Array(bits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const response: DeriveKeyResponse = {
        type: 'deriveKeyResult',
        key: hex,
      }
      self.postMessage(response)
    } catch (error) {
      self.postMessage({
        type: 'deriveKeyResult',
        key: '',
        error: (error as Error).message,
      })
    }
  }
}
