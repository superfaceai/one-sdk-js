import { SdkExecutionError } from './base';

describe('format', () => {
  const error = new SdkExecutionError(
    'short',
    ['long1', 'long2', 'long3'],
    ['hint1', 'hint2', 'hint3']
  );

  it('only returns the short message when short format is requested', () => {
    expect(error.formatShort()).toBe('short');
  });

  it('returns the short message, long message and hints when long format is requested', () => {
    expect(error.formatLong()).toBe(
      `short

long1
long2
long3

Hint: hint1
Hint: hint2
Hint: hint3
`
    );
  });

  it('returns the long format on .toString', () => {
    expect(error.toString()).toBe(
      `short

long1
long2
long3

Hint: hint1
Hint: hint2
Hint: hint3
`
    );

    expect(error[Symbol.toStringTag]()).toBe(
      `short

long1
long2
long3

Hint: hint1
Hint: hint2
Hint: hint3
`
    );
  });

  it('returns the long format in .message', () => {
    expect(error.message).toBe(
      `short

long1
long2
long3

Hint: hint1
Hint: hint2
Hint: hint3
`
    );
  });

  it('formats correctly when thrown', () => {
    expect(() => {
      throw error;
    }).toThrow(
      `short

long1
long2
long3

Hint: hint1
Hint: hint2
Hint: hint3
`
    );
  });
});
