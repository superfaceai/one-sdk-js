import { clone, recursiveKeyList } from './object';

describe('recursiveKeyList', () => {
  it('should return all objects keys from a flat object', () => {
    const object = {
      a: 1,
      2: true,
      nope: undefined,
    };

    expect(recursiveKeyList(object).sort()).toMatchObject(['2', 'a']);
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

    expect(recursiveKeyList(object).sort()).toMatchObject([
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
});
