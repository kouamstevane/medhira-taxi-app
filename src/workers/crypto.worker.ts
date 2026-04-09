import CryptoJS from 'crypto-js'

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

self.onmessage = (e: MessageEvent<DeriveKeyMessage>) => {
  const { type, seed, salt, iterations } = e.data

  if (type === 'deriveKey') {
    try {
      const derivedKey = CryptoJS.PBKDF2(seed, salt, {
        keySize: 256 / 32,
        iterations,
      }).toString()

      const response: DeriveKeyResponse = {
        type: 'deriveKeyResult',
        key: derivedKey,
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