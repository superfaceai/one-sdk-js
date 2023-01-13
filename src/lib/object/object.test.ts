import { clone, recursiveKeyList } from './object';

describe('recursiveKeyList', () => {
  it('should return all objects keys from a flat object', () => {
    const object = {
      a: 1,
      2: true,
      nope: undefined,
    };

    expect(recursiveKeyList(object).sort()).toMatchObject(['2', 'a', 'nope']);
  });

  it('should return all objects keys from a nested object', () => {
    const object = {
      a: 1,
      b: {
        c: {
          d: {
            e: 2,
          },
          f: null,
          g: undefined,
        },
      },
    };

    expect(recursiveKeyList(object, v => v !== undefined).sort()).toMatchObject([
      'a',
      'b',
      'b.c',
      'b.c.d',
      'b.c.d.e',
      'b.c.f',
    ]);
  });
});

describe('clone', () => {
  it('should clone any object', () => {
    const object = {
      a: 1,
      b: {
        c: {
          d: {
            e: 2,
          },
          f: null,
          g: undefined,
        },
      },
    };
    const cloned = clone(object);
    expect(cloned).toStrictEqual(cloned);
  });

  it('should clone undefined', () => {
    const object = undefined;
    const cloned = clone(object);
    expect(cloned).toStrictEqual(undefined);
  });

  it('should clone null', () => {
    const object = null;
    const cloned = clone(object);
    expect(cloned).toStrictEqual(null);
  });

  it('should clone empty object', () => {
    const object = {};
    const cloned = clone(object);
    expect(cloned).toStrictEqual({});
  });

  describe('when cloning buffer', () => {
    let object: { buffer: Buffer };

    beforeEach(() => {
      object = {
        buffer: Buffer.from('data'),
      };
    });

    it('should clone buffer', () => {
      const cloned = clone(object);
      expect(Buffer.isBuffer(cloned.buffer)).toBe(true);
      expect(cloned.buffer.toString()).toEqual(object.buffer.toString());
    });

    it('should create new instance of buffer', () => {
      const cloned = clone(object);
      expect(cloned.buffer).not.toBe(object.buffer);
    });
  });

  describe('when cloning array', () => {
    let object: { array: Array<any> };

    beforeEach(() => {
      object = {
        array: [1, { a: 1, b: 2, c: 'string' }],
      };
    });

    it('should clone array', () => {
      const cloned = clone(object);
      expect(Array.isArray(cloned.array)).toBe(true);
      expect(cloned).toStrictEqual(object);
    });

    it('should create new instance of array', () => {
      const cloned = clone(object);
      expect(cloned.array).not.toBe(object.array);
    });
  });

  describe('when cloning date', () => {
    let object: { date: Date };

    beforeEach(() => {
      object = {
        date: new Date(),
      };
    });

    it('should clone date', () => {
      const cloned = clone(object);
      expect(cloned.date).toBeInstanceOf(Date);
      expect(cloned.date).toStrictEqual(object.date);
    });

    it('should create new instance of date', () => {
      const cloned = clone(object);
      expect(cloned.date).not.toBe(object.date);
    });
  });
});
