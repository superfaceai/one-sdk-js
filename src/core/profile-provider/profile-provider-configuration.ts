export class ProfileProviderConfiguration {
  constructor(
    public readonly revision?: string,
    public readonly variant?: string
  ) {}

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}
