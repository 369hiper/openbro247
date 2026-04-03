/**
 * Shared LRU (Least Recently Used) Cache implementation
 * Replaces 3 duplicate implementations across the codebase
 */

export class LRUCache<T> {
  private cache: Map<string, T> = new Map();
  private accessOrder: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 500) {
    if (maxSize <= 0) {
      throw new Error('LRUCache maxSize must be positive');
    }
    this.maxSize = maxSize;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T): void {
    // Remove from order if exists
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(key);
    this.cache.set(key, value);

    // Evict if over capacity
    if (this.cache.size > this.maxSize) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
  }

  /**
   * Get a value from cache (marks as recently used)
   */
  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (mark as recently used)
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
    }
    return value;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all entries as iterator
   */
  entries(): IterableIterator<[string, T]> {
    return this.cache.entries();
  }

  /**
   * Get values as array
   */
  values(): IterableIterator<T> {
    return this.cache.values();
  }

  /**
   * Get keys as array
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; utilization: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: this.cache.size / this.maxSize
    };
  }
}

/**
 * Create an LRUCache with typed item constraint (item must have id field)
 */
export function createTypedLRUCache<T extends { id: string }>(maxSize: number = 500): LRUCache<T> {
  return new LRUCache<T>(maxSize);
}
