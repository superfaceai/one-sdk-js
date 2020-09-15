import { ProfileDocumentNode } from '@superindustries/language';

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
import { Provider } from './providers';
import { fetchProviders, RegistryProviderInfo } from './registry';

export class ServiceFinderQuery<TInput, TResult> {
  private inputConstraints: InputConstraint[] = [];
  private resultConstraints: ResultConstraint[] = [];
  private providerConstraints: ProviderConstraint[] = [];
  private providerConstraintBuilder = providerConstraint;

  constructor(
    private inputConstraintBuilder: InputConstraintsObject<TInput>,
    private resultConstraintBuilder: ResultConstraintsObject<TResult>,
    private profileId: string,
    private profileAST: ProfileDocumentNode,
    private usecase: string,
    private validationFunction?: (input: unknown) => input is TResult
  ) {}

  async find(): Promise<Provider<TInput, TResult>[]> {
    const providers = await fetchProviders(this.profileId);

    return providers
      .filter(this.filterByProvider)
      .map(
        provider =>
          new Provider(
            this.profileAST,
            provider.mappingUrl,
            this.usecase,
            provider.serviceUrl,
            this.validationFunction
          )
      );
  }

  async findFirst(): Promise<Provider<TInput, TResult>> {
    return (await this.find())[0];
  }

  serviceProvider(
    constraint: (serviceProvider: ProviderQueryConstraint) => ProviderConstraint
  ): this {
    this.providerConstraints.push(constraint(this.providerConstraintBuilder));

    return this;
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
}
