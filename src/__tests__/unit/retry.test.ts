import { retryWithBackoff } from '@/utils/retry';

jest.useFakeTimers();

describe('retryWithBackoff', () => {
  it('retourne le résultat dès le premier essai réussi', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('réessaie et réussit au deuxième essai', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const resultPromise = retryWithBackoff(operation, { baseDelay: 100 });

    await jest.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('lance l\'erreur après avoir atteint maxAttempts', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('always fail'));

    const resultPromise = retryWithBackoff(operation, {
      maxAttempts: 3,
      baseDelay: 100,
    });

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);

    await expect(resultPromise).rejects.toThrow('always fail');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('appelle onRetry avec le numéro de tentative et l\'erreur', async () => {
    const onRetry = jest.fn();
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const resultPromise = retryWithBackoff(operation, {
      baseDelay: 100,
      onRetry,
    });

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
  });

  it('respecte la limite maxDelay', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const resultPromise = retryWithBackoff(operation, {
      baseDelay: 5000,
      maxDelay: 6000,
    });

    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(6000);

    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('utilise les valeurs par défaut correctement', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(operation);

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
