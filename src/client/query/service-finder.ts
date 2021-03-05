import { ProfileDocumentNode } from '@superfaceai/ast';

import { NonPrimitive } from '../../internal/interpreter/variables';
import {
  InputConstraint,
  InputConstraintsObject,
  isProviderMustBeConstraint,
  isProviderMustBeOneOfConstraint,
  ProviderConstraint,
  providerConstraint,
  ProviderQueryConstraint,
  ResultConstraint,
  ResultConstraintsObject,
} from './constraints';
import { ProfileProvider } from './profile-provider';
import { fetchProviders, RegistryProviderInfo } from './registry';

export class ServiceFinderQuery {
  private providerConstraints: ProviderConstraint[] = [];
  private providerConstraintBuilder = providerConstraint;

  constructor(
    /** ID of the profile */
    protected profileId: string,
    /** Compiled profile AST */
    protected profileAST: ProfileDocumentNode,
    /** Usecase to execute */
    // protected usecase: string,
    /** Url of registry from which to fetch service providers */
    private registryUrl = 'https://registry.superface.dev/api/registry'
  ) {}

  /**
    Adds a filter for limiting what the service provider can be
   */
  serviceProvider(
    constraint: (serviceProvider: ProviderQueryConstraint) => ProviderConstraint
  ): this {
    this.providerConstraints.push(constraint(this.providerConstraintBuilder));

    return this;
  }

  /**
    Finds Providers matching given criteria
   */
  async find(): Promise<ProfileProvider[]> {
    return (await this.findProviders()).map(this.createProvider);
  }

  /**
    Finds first Provider matching given criteria
   */
  async findFirst(): Promise<ProfileProvider> {
    return (await this.find())[0];
  }

  private filterByProvider = (providerInfo: RegistryProviderInfo): boolean => {
    if (this.providerConstraints.length === 0) {
      return true;
    }

    const mustBeConstraint = this.providerConstraints.find(
      isProviderMustBeConstraint
    );
    if (mustBeConstraint) {
      return providerInfo.serviceUrl === mustBeConstraint.value;
    }

    const mustBeOneOfConstraint = this.providerConstraints.find(
      isProviderMustBeOneOfConstraint
    );
    if (mustBeOneOfConstraint) {
      return mustBeOneOfConstraint.values.includes(providerInfo.serviceUrl);
    }

    throw new Error('Unreachable code reached😱');
  };

  protected createProvider = (providerInfo: RegistryProviderInfo): ProfileProvider =>
    new ProfileProvider(
      this.profileAST,
      providerInfo.mappingUrl,
      // this.usecase,
      providerInfo.serviceUrl
    );

  protected async findProviders(): Promise<RegistryProviderInfo[]> {
    const providers = await fetchProviders(this.profileId, this.registryUrl);

    return providers.filter(this.filterByProvider);
  }
}

export class TypedServiceFinderQuery<
  TInput extends NonPrimitive,
  TResult
> extends ServiceFinderQuery {
  private inputConstraints: InputConstraint[] = [];
  private resultConstraints: ResultConstraint[] = [];

  constructor(
    private inputConstraintBuilder: InputConstraintsObject<TInput>,
    private resultConstraintBuilder: ResultConstraintsObject<TResult>,
    profileId: string,
    profileAST: ProfileDocumentNode
    // usecase: string,
    // private validationFunction?: (input: unknown) => input is TResult
  ) {
    super(profileId, profileAST /* usecase */);
  }

  inputParameter(
    constraint: (parameters: InputConstraintsObject<TInput>) => InputConstraint
  ): this {
    this.inputConstraints.push(constraint(this.inputConstraintBuilder));

    return this;
  }

  resultParameter(
    constraint: (
      parameters: ResultConstraintsObject<TResult>
    ) => ResultConstraint
  ): this {
    this.resultConstraints.push(constraint(this.resultConstraintBuilder));

    return this;
  }

  async find(): Promise<ProfileProvider[]> {
    return (await this.findProviders()).map(this.createProvider);
  }

  async findFirst(): Promise<ProfileProvider> {
    return (await this.find())[0];
  }

  protected createProvider = (providerInfo: RegistryProviderInfo): ProfileProvider => {
    return new ProfileProvider(
      this.profileAST,
      providerInfo.mappingUrl,
      // this.usecase,
      providerInfo.serviceUrl
      // this.validationFunction
    );
  };
}
