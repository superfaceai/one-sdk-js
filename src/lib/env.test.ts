import { resolveEnv, resolveEnvRecord } from './env';

describe('lib/env', () => {
  it('resolves env correctly when it is found', () => {
    const mockEnvVariable = 'superJsonTest';
    const originalEnvValue = process.env[mockEnvVariable];
    process.env[mockEnvVariable] = 'test';
    expect(resolveEnv(`$${mockEnvVariable}`)).toEqual('test');
    process.env[mockEnvVariable] = originalEnvValue;
  });

  it('resolves env correctly when it is not found', () => {
    const mockEnvVariable = 'superJsonTest';
    const originalEnvValue = process.env[mockEnvVariable];
    delete process.env[mockEnvVariable];
    expect(resolveEnv(`$${mockEnvVariable}`)).toEqual(`$${mockEnvVariable}`);
    process.env[mockEnvVariable] = originalEnvValue;
  });
});

describe('when resolving env record', () => {
  it('resolves env correctly when value is string', () => {
    const mockEnvVariable = 'superJsonTest';
    const originalEnvValue = process.env[mockEnvVariable];
    process.env[mockEnvVariable] = 'test';
    const mockRecord = { testKey: `$${mockEnvVariable}` };

    expect(resolveEnvRecord(mockRecord)).toEqual({
      testKey: 'test',
    });

    process.env[mockEnvVariable] = originalEnvValue;
  });

  it('resolves env correctly when value is object', () => {
    const mockEnvVariable = 'superJsonTest';
    const originalEnvValue = process.env[mockEnvVariable];
    process.env[mockEnvVariable] = 'test';
    const mockRecord = {
      testWrapperKey: { testKey: `$${mockEnvVariable}` },
      nullKey: null,
    };

    expect(resolveEnvRecord(mockRecord)).toEqual({
      testWrapperKey: { testKey: 'test' },
      nullKey: null,
    });

    process.env[mockEnvVariable] = originalEnvValue;
  });
});
