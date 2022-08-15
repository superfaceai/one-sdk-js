import { MockEnvironment } from '../../mock';
import { resolveEnv, resolveEnvRecord } from './env';

const mockEnvVariable = 'superJsonTest';
const environment = new MockEnvironment();

describe('lib/env', () => {
  beforeEach(() => {
    environment.clear();
  });

  it('resolves env correctly when it is found', () => {
    environment.addValue(mockEnvVariable, 'test');
    expect(resolveEnv(`$${mockEnvVariable}`, environment)).toEqual('test');
  });

  it('resolves env correctly when it is not found', () => {
    expect(resolveEnv(`$${mockEnvVariable}`, environment)).toEqual(
      `$${mockEnvVariable}`
    );
  });
});

describe('when resolving env record', () => {
  beforeEach(() => {
    environment.clear();
  });

  it('resolves env correctly when value is string', () => {
    environment.addValue(mockEnvVariable, 'test');
    const mockRecord = { testKey: `$${mockEnvVariable}` };

    expect(resolveEnvRecord(mockRecord, environment)).toEqual({
      testKey: 'test',
    });
  });

  it('resolves env correctly when value is object', () => {
    environment.addValue(mockEnvVariable, 'test');
    const mockRecord = {
      testWrapperKey: { testKey: `$${mockEnvVariable}` },
      nullKey: null,
    };

    expect(resolveEnvRecord(mockRecord, environment)).toEqual({
      testWrapperKey: { testKey: 'test' },
      nullKey: null,
    });
  });

  it('resolves env correctly when value is undefined', () => {
    environment.addValue(mockEnvVariable, 'test');
    const mockRecord = {
      testKey: `$${mockEnvVariable}`,
      undefinedKey: undefined,
    };

    expect(resolveEnvRecord(mockRecord, environment)).toEqual({
      testKey: 'test',
    });
  });
});
