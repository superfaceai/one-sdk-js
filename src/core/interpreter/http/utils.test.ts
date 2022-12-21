import {
  createUrl,
  deleteHeader,
  getHeader,
  hasHeader,
  setHeader,
} from './utils';

describe('interpreter · http · utils', () => {
  describe('getHeader', () => {
    it('returns all values', () => {
      expect(
        getHeader({ foo: 'bar', Foo: 'baz', FOO: ['qux', 'quz'] }, 'foo')
      ).toEqual('bar, baz, qux, quz');
    });

    it('cleans up undefined values', () => {
      expect(
        getHeader({ foo: 'bar', Foo: undefined, FOO: ['qux', 'quz'] }, 'foo')
      ).toEqual('bar, qux, quz');
    });
  });

  describe('hasHeader', () => {
    it('should return true if header is present', () => {
      expect(hasHeader({ Foo: 'bar' }, 'foo')).toBe(true);
    });

    it('should return false if header is not present', () => {
      expect(hasHeader({ Foo: 'bar' }, 'baz')).toBe(false);
    });
  });

  describe('setHeader', () => {
    it('mutates passed data', () => {
      const headers = {};
      setHeader(headers, 'foo', 'bar');
      expect(headers).toEqual({ foo: 'bar' });
    });

    it('does not mutate passed data if header already exists', () => {
      const headers = { foo: 'bar' };
      setHeader(headers, 'foo', 'baz');
      expect(headers).toEqual({ foo: 'bar' });
    });
  });

  describe('deleteHeader', () => {
    it('deletes both foo and Foo headers', () => {
      const headers = { foo: 'bar', Foo: 'baz' };
      deleteHeader(headers, 'Foo');
      expect(headers).toEqual({});
    });
  });

  describe('createUrl', () => {
    it('correctly creates url for empty string', () => {
      const mapUrl = '';
      expect(createUrl(mapUrl, { baseUrl: 'http://example.com' })).toBe(
        'http://example.com'
      );
    });

    it('correctly creates url for single slash', () => {
      const mapUrl = '/';
      expect(createUrl(mapUrl, { baseUrl: 'http://example.com' })).toBe(
        'http://example.com/'
      );
    });

    it('returns an error for absolute url', () => {
      const mapUrl = 'something';
      expect(() =>
        createUrl(mapUrl, { baseUrl: 'http://example.com' })
      ).toThrow('Expected relative url');
    });
  });
});
