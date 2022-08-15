export class ProfileConfiguration {
  constructor(public readonly id: string, public readonly version: string) {}

  public get cacheKey(): string {
    // TODO: Research a better way?
    return JSON.stringify(this);
  }
}
