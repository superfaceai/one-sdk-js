import { MockEnvironment } from '../../../mock';
import { NodeCrypto } from '../../../node';
import { normalizeSuperJsonDocument } from '../../../schema-tools';
import { anonymizeSuperJson, hashSuperJson } from './utils';

const environment = new MockEnvironment();

describe('MetricReporter utils', () => {
  // TODO: Proper tests for config hash and anonymization
  describe('when computing config hash', () => {
    it('does debug', () => {
      const superJson = {
        profiles: {
          abc: {
            file: 'x',
            priority: ['first', 'second'],
            providers: {
              second: {
                mapRevision: '1.0',
              },
              first: {
                file: 'file://some/path',
              },
            },
          },
          ghe: {
            version: '1.2.3',
          },
          def: 'file://hi/hello',
        },
        providers: {
          foo: {},
          bar: {
            file: 'hi',
          },
        },
      };

      const normalized = normalizeSuperJsonDocument(superJson, environment);
      expect(anonymizeSuperJson(normalized)).toEqual({
        profiles: {
          abc: {
            version: 'file',
            providers: [
              {
                provider: 'second',
                priority: 1,
                version: '1.0',
              },
              {
                provider: 'first',
                priority: 0,
                version: 'file',
              },
            ],
          },
          ghe: {
            version: '1.2.3',
            providers: [],
          },
          def: {
            version: 'file',
            providers: [],
          },
        },
        providers: ['foo', 'bar'],
      });

      expect(hashSuperJson(normalized, new NodeCrypto())).toBe(
        'd090f0589a19634c065e903a81006f79'
      );
    });
  });
});
