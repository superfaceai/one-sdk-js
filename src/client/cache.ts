export class SuperCache<T> {
  private cache: Record<string, T> = {};

  getCached(cacheKey: string, initializer: () => T): T;
  getCached(cacheKey: string, initializer: () => Promise<T>): Promise<T>;
  getCached(
    cacheKey: string,
    initializer: () => T | Promise<T>
  ): T | Promise<T> {
    const cached = this.cache[cacheKey];
    if (cached !== undefined) {
      return this.cache[cacheKey];
    }

    const initialized = initializer();
    if (initialized instanceof Promise) {
      return new Promise((resolve, reject) => {
        initialized
          .then(value => {
            this.cache[cacheKey] = value;
            resolve(value);
          })
          .catch(reject);
      });
    } else {
      this.cache[cacheKey] = initialized;

      return initialized;
    }
  }
}
