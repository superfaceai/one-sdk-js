import { prepareProviderParameters, ProviderJson } from '@superfaceai/ast';

export function resolveIntegrationParameters(
  providerJson: ProviderJson,
  parameters?: Record<string, string>
): Record<string, string> | undefined {
  if (parameters === undefined) {
    return undefined;
  }

  const providerJsonParameters = providerJson.parameters || [];
  if (
    Object.keys(parameters).length !== 0 &&
    providerJsonParameters.length === 0
  ) {
    console.warn(
      'Warning: Super.json defines integration parameters but provider.json does not'
    );
  }
  const result: Record<string, string> = {};

  const preparedParameters = prepareProviderParameters(
    providerJson.name,
    providerJsonParameters
  );

  // Resolve parameters defined in super.json
  for (const [key, value] of Object.entries(parameters)) {
    const providerJsonParameter = providerJsonParameters.find(
      parameter => parameter.name === key
    );
    // If value name and prepared value equals we are dealing with unset env
    if (
      providerJsonParameter &&
      preparedParameters[providerJsonParameter.name] === value
    ) {
      if (providerJsonParameter.default !== undefined) {
        result[key] = providerJsonParameter.default;
      }
    }

    // Use original value
    if (!result[key]) {
      result[key] = value;
    }
  }

  // Resolve parameters which are missing in super.json and have default value
  for (const parameter of providerJsonParameters) {
    if (
      result[parameter.name] === undefined &&
      parameter.default !== undefined
    ) {
      result[parameter.name] = parameter.default;
    }
  }

  return result;
}
