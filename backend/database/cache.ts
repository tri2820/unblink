// Generic cache class for database utilities
export class DatabaseCache {
  private cache = new Map<string, any>();

  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clear all keys that start with a prefix
  clearPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // Check if key exists
  has(key: string): boolean {
    return this.cache.has(key);
  }

  // Get the size of the cache (for testing)
  size(): number {
    return this.cache.size;
  }

  // Get all keys (for testing)
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}