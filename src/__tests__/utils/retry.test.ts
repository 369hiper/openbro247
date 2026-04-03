/**
 * Unit tests for retry utility
 */
import { withRetry, createRetryWrapper, RetryOptions } from '../../utils/retry';

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry retryable errors and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, { maxAttempts: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail after max attempts for non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    
    await expect(withRetry(fn, { maxAttempts: 3 }))
      .rejects.toThrow('always fails');
    
    // Non-retryable errors don't retry
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry non-retryable errors by default', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('ValidationError'));
    
    await expect(withRetry(fn, { maxAttempts: 3 }))
      .rejects.toThrow('ValidationError');
    
    // Should not retry validation errors
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry retryable errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, { maxAttempts: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call onRetry callback', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');
    const onRetry = jest.fn();
    
    await withRetry(fn, { maxAttempts: 2, onRetry });
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1, 
      expect.any(Error), 
      expect.any(Number)
    );
  });

  it('should respect custom retryable errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('CustomError'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, { 
      maxAttempts: 2,
      retryableErrors: ['CustomError']
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use custom base delay', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');
    
    const start = Date.now();
    await withRetry(fn, { 
      maxAttempts: 2, 
      baseDelay: 200
    });
    const elapsed = Date.now() - start;
    
    // Should wait at least 200ms (plus jitter)
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });
});

describe('createRetryWrapper', () => {
  it('should create a retry-enabled function for retryable errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');
    
    const wrappedFn = createRetryWrapper(fn, { maxAttempts: 3 });
    const result = await wrappedFn();
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should pass arguments to wrapped function', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    
    const wrappedFn = createRetryWrapper(
      (a: number, b: number) => fn(a + b), 
      { maxAttempts: 1 }
    );
    
    const result = await wrappedFn(2, 3);
    
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith(5);
  });
});

describe('RetryOptions', () => {
  it('should have correct default values', () => {
    const options: RetryOptions = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryableErrors: ['ECONNRESET']
    };
    
    expect(options.maxAttempts).toBe(3);
    expect(options.baseDelay).toBe(1000);
    expect(options.maxDelay).toBe(10000);
  });
});
