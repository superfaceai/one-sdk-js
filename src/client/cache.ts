export class SuperCache<T> {
  private cache: Record<string, T> = {};

  public getCached(cacheKey: string, initializer: () => T): T;
  public getCached(cacheKey: string, initializer: () => Promise<T>): Promise<T>;
  public getCached(
    cacheKey: string,
    initializer: () => T | Promise<T>
  ): T | Promise<T> {
    const cached = this.cache[cacheKey];
    if (cached !== undefined) {
      return cached;
    }

    const initialized = initializer();
    if (initialized instanceof Promise) {
      return initialized.then(value => {
        this.cache[cacheKey] = value;

        return value;
      });
    } else {
      this.cache[cacheKey] = initialized;

      return initialized;
    }
  }

  public invalidate(cacheKey: string): void {
    if (this.cache[cacheKey] !== undefined) {
      delete this.cache[cacheKey];
    }
  }
}
