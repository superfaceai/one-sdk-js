import { pipe } from './pipe';

describe('pipe', () => {
  it('should pipe the value through filters correctly', async () => {
    const result = await pipe(
      2,
      input => input * 2,
      input => input + 1
    );
    expect(result).toBe(5);
  });

  it('should clone initial object', async () => {
    const original = { value: 7 };
    const result = await pipe(original, input => {
      input.value = 5;

      return input;
    });

    expect(original.value).toBe(7);
    expect(result.value).toBe(5);
  });
});
