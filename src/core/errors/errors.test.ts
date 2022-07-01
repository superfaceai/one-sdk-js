import { SDKExecutionError, UnexpectedError } from './errors';

describe('errors', () => {
  describe('UnexpectedError', () => {
    const error = new UnexpectedError('out of nowhere');

    it('throws in correct format', () => {
      expect(() => {
        throw error;
      }).toThrow('out of nowhere');
    });

    it('returns correct format', () => {
      expect(error.toString()).toEqual('UnexpectedError: out of nowhere');
    });
  });

  describe('SDKExecutionError', () => {
    const error = new SDKExecutionError(
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

      expect(Object.prototype.toString.call(error)).toBe(
        '[object SdkExecutionError]'
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
});
