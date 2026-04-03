/**
 * Unit tests for LRUCache
 */
import { LRUCache } from '../../utils/cache';

describe('LRUCache', () => {
  let cache: LRUCache<{ id: string; name: string }>;

  beforeEach(() => {
    cache = new LRUCache<{ id: string; name: string }>(3);
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('1', { id: '1', name: 'one' });
      
      const result = cache.get('1');
      
      expect(result).toEqual({ id: '1', name: 'one' });
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      
      expect(result).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('1', { id: '1', name: 'updated' });
      
      const result = cache.get('1');
      
      expect(result?.name).toBe('updated');
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('1', { id: '1', name: 'one' });
      
      expect(cache.has('1')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove keys from cache', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.delete('1');
      
      expect(cache.has('1')).toBe(false);
    });

    it('should return true when key existed', () => {
      cache.set('1', { id: '1', name: 'one' });
      
      const result = cache.delete('1');
      
      expect(result).toBe(true);
    });

    it('should return false when key did not exist', () => {
      const result = cache.delete('nonexistent');
      
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      cache.clear();
      
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      
      expect(cache.size()).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when over capacity', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      cache.set('3', { id: '3', name: 'three' });
      cache.set('4', { id: '4', name: 'four' }); // Should evict '1'
      
      expect(cache.has('1')).toBe(false);
      expect(cache.has('2')).toBe(true);
      expect(cache.has('3')).toBe(true);
      expect(cache.has('4')).toBe(true);
    });

    it('should update LRU order on access', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      cache.set('3', { id: '3', name: 'three' });
      
      // Access '1' to make it recently used
      cache.get('1');
      
      // Add new item - should evict '2' (least recently used after '1' was accessed)
      cache.set('4', { id: '4', name: 'four' });
      
      expect(cache.has('1')).toBe(true); // Was accessed, should be safe
      expect(cache.has('2')).toBe(false); // Least recently used
      expect(cache.has('3')).toBe(true);
      expect(cache.has('4')).toBe(true);
    });

    it('should update LRU order on set', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      cache.set('3', { id: '3', name: 'three' });
      
      // Update '1' to make it recently used
      cache.set('1', { id: '1', name: 'updated' });
      
      // Add new item - should evict '2'
      cache.set('4', { id: '4', name: 'four' });
      
      expect(cache.has('1')).toBe(true);
      expect(cache.has('2')).toBe(false);
      expect(cache.has('3')).toBe(true);
      expect(cache.has('4')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.utilization).toBeCloseTo(0.667);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid maxSize', () => {
      expect(() => new LRUCache(0)).toThrow('maxSize must be positive');
      expect(() => new LRUCache(-1)).toThrow('maxSize must be positive');
    });
  });

  describe('entries, keys, values', () => {
    it('should return entries iterator', () => {
      cache.set('1', { id: '1', name: 'one' });
      cache.set('2', { id: '2', name: 'two' });
      
      const entries = Array.from(cache.entries());
      
      expect(entries.length).toBe(2);
    });

    it('should return keys iterator', () => {
      cache.set('1', { id: '1', name: 'one' });
      
      const keys = Array.from(cache.keys());
      
      expect(keys).toContain('1');
    });

    it('should return values iterator', () => {
      cache.set('1', { id: '1', name: 'one' });
      
      const values = Array.from(cache.values());
      
      expect(values[0].name).toBe('one');
    });
  });
});
