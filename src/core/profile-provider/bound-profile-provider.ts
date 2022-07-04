import {
  MapDocumentNode,
  NormalizedProfileProviderSettings,
  ProfileDocumentNode,
  ProviderJson,
  SecurityValues,
} from '@superfaceai/ast';

import { err, forceCast, ok, profileAstId, Result } from '../../lib';
import { Events, Interceptable, MapInterpreterEventAdapter } from '../events';
import { IConfig, ICrypto, ILogger, LogFunction } from '../interfaces';
import {
  AuthCache,
  castToNonPrimitive,
  IFetch,
  MapInterpreter,
  MapInterpreterError,
  mergeVariables,
  NonPrimitive,
  ProfileParameterError,
  ProfileParameterValidator,
  SecurityConfiguration,
} from '../interpreter';
import { IServiceSelector } from '../services';
import { resolveSecurityConfiguration } from './security';

const DEBUG_NAMESPACE_SENSITIVE = 'bound-profile-provider:sensitive';

export interface IBoundProfileProvider {
  perform<
    TInput extends NonPrimitive | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TResult = any
  >(
    usecase: string,
    input?: TInput,
    parameters?: Record<string, string>,
    securityValues?: SecurityValues[]
  ): Promise<Result<TResult, ProfileParameterError | MapInterpreterError>>;
}

export class BoundProfileProvider implements IBoundProfileProvider {
  private profileValidator: ProfileParameterValidator;
  private readonly logSensitive: LogFunction | undefined;

  constructor(
    private readonly profileAst: ProfileDocumentNode,
    private readonly mapAst: MapDocumentNode,
    private readonly provider: ProviderJson,
    private readonly config: IConfig,
    public readonly configuration: {
      services: IServiceSelector;
      profileProviderSettings?: NormalizedProfileProviderSettings;
      security: SecurityConfiguration[];
      parameters?: Record<string, string>;
    },
    private readonly crypto: ICrypto,
    private readonly fetchInstance: IFetch & Interceptable & AuthCache,
    private readonly logger?: ILogger,
    events?: Events
  ) {
    this.profileValidator = new ProfileParameterValidator(
      this.profileAst,
      this.logger
    );

    this.fetchInstance.metadata = {
      profile: profileAstId(profileAst),
      provider: provider.name,
    };
    this.fetchInstance.events = events;
    this.logSensitive = logger?.log(DEBUG_NAMESPACE_SENSITIVE);
  }

  /**
   * Performs the usecase while validating input and output against the profile definition.
   *
   * Note that the `TInput` and `TResult` types cannot be checked for compatibility with the profile definition, so the caller
   * is responsible for ensuring that the cast is safe.
   */
  public async perform<
    TInput extends NonPrimitive | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TResult = any
  >(
    usecase: string,
    input?: TInput,
    parameters?: Record<string, string>,
    securityValues?: SecurityValues[]
  ): Promise<Result<TResult, ProfileParameterError | MapInterpreterError>> {
    this.fetchInstance.metadata = {
      profile: profileAstId(this.profileAst),
      usecase,
      provider: this.provider.name,
    };
    // compose and validate the input
    const composedInput = this.composeInput(usecase, input);

    const inputValidation = this.profileValidator.validate(
      composedInput,
      'input',
      usecase
    );
    if (inputValidation.isErr()) {
      return err(inputValidation.error);
    }
    forceCast<TInput>(composedInput);

    const security = securityValues
      ? resolveSecurityConfiguration(
          this.provider.securitySchemes ?? [],
          securityValues,
          this.provider.name
        )
      : this.configuration.security;

    // create and perform interpreter instance
    const interpreter = new MapInterpreter<TInput>(
      {
        input: composedInput,
        usecase,
        services: this.configuration.services,
        security,
        parameters: this.mergeParameters(
          parameters,
          this.configuration.parameters
        ),
      },
      {
        config: this.config,
        fetchInstance: this.fetchInstance,
        externalHandler: new MapInterpreterEventAdapter(
          this.fetchInstance.metadata,
          this.fetchInstance.events
        ),
        logger: this.logger,
        crypto: this.crypto,
      }
    );

    const result = await interpreter.perform(this.mapAst);
    if (result.isErr()) {
      return err(result.error);
    }

    // validate output
    const resultValidation = this.profileValidator.validate(
      result.value,
      'result',
      usecase
    );

    if (resultValidation.isErr()) {
      return err(resultValidation.error);
    }
    forceCast<TResult>(result.value);

    return ok(result.value);
  }

  private composeInput(
    usecase: string,
    input?: NonPrimitive | undefined
  ): NonPrimitive | undefined {
    let composed = input;

    const defaultInput = castToNonPrimitive(
      this.configuration.profileProviderSettings?.defaults[usecase]?.input
    );
    if (defaultInput !== undefined) {
      composed = mergeVariables(defaultInput, input ?? {});
      this.logSensitive?.('Composed input with defaults: %O', composed);
    }

    return composed;
  }

  private mergeParameters(
    parameters?: Record<string, string>,
    providerParameters?: Record<string, string>
  ): Record<string, string> | undefined {
    if (parameters === undefined) {
      return providerParameters;
    }

    if (providerParameters === undefined) {
      return parameters;
    }

    return {
      ...providerParameters,
      ...parameters,
    };
  }
}
