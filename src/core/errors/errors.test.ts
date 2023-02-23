import { ErrorBase, SDKExecutionError, UnexpectedError } from './errors';

describe('errors', () => {
  describe('ErrorBase', () => {
    let error: ErrorBase;

    class MyError extends ErrorBase {}

    beforeEach(() => {
      error = new MyError('MyKind', 'My message');
      console.log(error);
    });

    it('has kind', () => {
      expect(error.kind).toBe('MyKind');
    });

    it('has name', () => {
      expect(error.name).toBe('MyKind');
    });

    it('creates default string description', () => {
      expect(Object.prototype.toString.call(error)).toBe('[object MyKind]');
    });

    it('strigifies kind and message', () => {
      expect(error.toString()).toBe('MyKind: My message');
    });
  });

  describe('UnexpectedError', () => {
    let error: UnexpectedError;

    beforeEach(() => {
      error = new UnexpectedError('out of nowhere');
    });

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
    let error: SDKExecutionError;

    beforeEach(() => {
      error = new SDKExecutionError(
        'short',
        ['long1', 'long2', 'long3'],
        ['hint1', 'hint2', 'hint3']
      );
    });

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
        '[object SDKExecutionError]'
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
