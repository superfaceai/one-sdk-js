import type { IUseCase } from './usecase';

export interface IProfile {
  getConfiguredProviders(): string[];
  getUseCase(name: string): IUseCase;
}
