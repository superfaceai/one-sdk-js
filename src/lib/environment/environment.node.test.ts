import { NodeEnvironment } from './environment.node';

describe('NodeEnvironment', () => {
  const environment = new NodeEnvironment();
  const variableName = 'TEST_VARIABLE';
  const originalValue = process.env[variableName];

  beforeEach(() => {
    delete process.env[variableName];
  });

  afterAll(() => {
    if (originalValue !== undefined) {
      process.env[variableName] = originalValue;
    }
  });

  it('successfuly gets a string from environment', () => {
    process.env[variableName] = 'test';

    expect(environment.getString(variableName)).toBe('test');
  });

  it('successfuly gets a number from environment', () => {
    process.env[variableName] = '13';

    expect(environment.getNumber(variableName)).toBe(13);
  });

  it('successfuly gets a boolean from environment', () => {
    process.env[variableName] = 'true';
    expect(environment.getBoolean(variableName)).toBe(true);

    process.env[variableName] = '1';
    expect(environment.getBoolean(variableName)).toBe(true);

    process.env[variableName] = 'false';
    expect(environment.getBoolean(variableName)).toBe(false);
  });

  it('returns NaN when the variable is not a number', () => {
    process.env[variableName] = 'not a number';

    expect(environment.getNumber(variableName)).toBeNaN();
  });

  it('trims a string variable', () => {
    process.env[variableName] = '  test  ';

    expect(environment.getString(variableName)).toBe('test');
  });

  it('returns undefined when no value is found', () => {
    expect(environment.getString(variableName)).toBeUndefined();
    expect(environment.getNumber(variableName)).toBeUndefined();
    expect(environment.getBoolean(variableName)).toBeUndefined();
  });
});
