let workerInstance: Worker | null = null

export function getCryptoWorker(): Worker | null {
  if (typeof window === 'undefined') return null

  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('./crypto.worker.ts', import.meta.url),
        { type: 'module' }
      )
    } catch {
      return null
    }
  }

  return workerInstance
}

export function terminateCryptoWorker(): void {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
  }
}