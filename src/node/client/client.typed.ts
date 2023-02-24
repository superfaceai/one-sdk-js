import type { UsecaseType } from '../../core';
import { resolveProfileAst, resolveProfileId, TypedProfile } from '../../core';
import type { NonPrimitive } from '../../lib';
import { NodeFileSystem } from '../filesystem';
import { SuperfaceClientBase } from './client';

type ProfileUseCases<TInput extends NonPrimitive | undefined, TOutput> = {
  [profile: string]: UsecaseType<TInput, TOutput>;
};

export type TypedSuperfaceClient<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TProfiles extends ProfileUseCases<any, any>
> = SuperfaceClientBase & {
  getProfile<TProfile extends keyof TProfiles>(
    profile: TProfile | { id: TProfile; version?: string }
  ): Promise<TypedProfile<TProfiles[TProfile]>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTypedClient<TProfiles extends ProfileUseCases<any, any>>(
  profileDefinitions: TProfiles
): { new (): TypedSuperfaceClient<TProfiles> } {
  return class TypedSuperfaceClientClass
    extends SuperfaceClientBase
    implements TypedSuperfaceClient<TProfiles>
  {
    public async getProfile<TProfile extends keyof TProfiles>(
      profile: TProfile | { id: TProfile; version?: string }
    ): Promise<TypedProfile<TProfiles[TProfile]>> {
      const { id, version } = resolveProfileId(
        profile as string | { id: string; version?: string }
      );

      const ast = await resolveProfileAst({
        profileId: id,
        version,
        logger: this.logger,
        fetchInstance: this.fetchInstance,
        fileSystem: NodeFileSystem,
        config: this.config,
        crypto: this.crypto,
        superJson: this.superJson,
      });
      const profileConfiguration = await this.internal.getProfileConfiguration(
        ast
      );

      return new TypedProfile(
        profileConfiguration,
        ast,
        this.events,
        this.superJson,
        this.boundProfileProviderCache,
        this.config,
        this.sandbox,
        this.timers,
        NodeFileSystem,
        this.crypto,
        this.fetchInstance,
        Object.keys(profileDefinitions[id]),
        this.logger
      );
    }
  };
}

export const typeHelper = <TInput, TOutput>(): [TInput, TOutput] => {
  return [undefined as unknown, undefined as unknown] as [TInput, TOutput];
};
