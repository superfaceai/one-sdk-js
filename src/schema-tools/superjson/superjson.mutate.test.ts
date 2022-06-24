import {
  BackoffKind,
  OnFail,
  ProfileEntry,
  ProfileProviderEntry,
  ProfileSettings,
  ProviderEntry,
  SuperJsonDocument,
  UsecaseDefaults,
} from '@superfaceai/ast';

import { SuperJson } from '.';

describe('superjson mutate', () => {
  let superjson: SuperJson;

  beforeEach(() => {
    superjson = new SuperJson({});
  });

  describe('when merging profile defaults', () => {
    it('merges profile deafults to empty super.json multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: false, input: { test: 'test' } },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'test' },
          },
        },
        version: '0.0.0',
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: true,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'new-test' },
          },
        },
        version: '0.0.0',
      });
    });

    it('merges profile deafults to super.json with profile using uri path multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: { [mockProfileName]: 'file://some/path' },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: false, input: { test: 'test' } },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'test' },
          },
        },
        file: 'file://some/path',
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: true,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'new-test' },
          },
        },
        file: 'file://some/path',
      });
    });

    it('merges profile deafults to super.json with existing profile multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            version: '1.0.0',
            priority: ['test'],
            providers: { test: {} },
          },
        },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: true, input: { test: 'test' } },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: false,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'new-test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });
    });

    it('merges profile deafults to super.json with existing profile and existing defaults multiple times', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            version: '1.0.0',
            priority: ['test'],
            defaults: { [mockUseCaseName]: { providerFailover: false } },
            providers: { test: {} },
          },
        },
      });

      let mockProfileDeafultsEntry: UsecaseDefaults = {
        [mockUseCaseName]: { providerFailover: true, input: { test: 'test' } },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
            input: { test: 'test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });

      mockProfileDeafultsEntry = {
        [mockUseCaseName]: {
          providerFailover: false,
          input: { test: 'new-test' },
        },
      };

      expect(
        superjson.mergeProfileDefaults(
          mockProfileName,
          mockProfileDeafultsEntry
        )
      ).toEqual(true);
      expect(superjson.document.profiles?.[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
            input: { test: 'new-test' },
          },
        },
        version: '1.0.0',
        priority: ['test'],
        providers: { test: {} },
      });
    });
  });

  describe('when merging profile', () => {
    it('merges profile to empty super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('merges multiple profiles', () => {
      let mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });

      mockProfileName = 'second-profile';

      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );

      expect(superjson.normalized.profiles).toEqual({
        profile: {
          defaults: {},
          file: 'some/path',
          priority: [],
          providers: {},
        },
        ['second-profile']: {
          defaults: {},
          file: 'some/path',
          priority: [],
          providers: {},
        },
      });
    });

    it('merges profile to super.json with empty profile defaults using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('merges profile to super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        priority: [],
        file: 'some/path',
        providers: {},
      });
    });

    it('merges profile to super.json using version string', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = '1.0.0';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        priority: [],
        providers: {},
        version: '1.0.0',
      });
    });

    it('merges profile to super.json using version string and empty defaults', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = '1.0.0';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [],
        providers: {},
        version: '1.0.0',
      });
    });

    it('throws error on invalid payload string', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = 'madeup';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: {},
          },
        },
      });
      expect(() =>
        superjson.mergeProfile(mockProfileName, mockProfileEntry)
      ).toThrowError(new Error('Invalid string payload format'));
    });

    it('merges profile to super.json', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = {
        defaults: {},
        file: 'some/path',
        providers: {},
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: { input: { input: { test: 'test' } } },
            file: 'some/path',
            providers: { test: {} },
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          input: { input: { test: 'test' }, providerFailover: false },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('merges profile to super.json with string targed profile', () => {
      const mockProfileName = 'profile';
      const mockProfileEntry: ProfileEntry = {
        defaults: {},
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {},
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('merges profile to super.json with priority and disabled providerFailover', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: false,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: false,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: 'none',
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('merges profile to super.json with priority and enabled providerFailover', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: { test: {} },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '0.0.0',
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: true,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: 'none',
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });

    it('merges profile to super.json with existing priority, enabled providerFailover and retry policy', () => {
      const mockProfileName = 'profile';
      const mockUseCaseName = 'usecase';

      const mockProfileEntry: ProfileEntry = {
        defaults: {
          [mockUseCaseName]: {
            providerFailover: true,
          },
        },
        priority: ['test'],
        file: 'some/path',
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: OnFail.CIRCUIT_BREAKER,
                  // Different numbers
                  maxContiguousRetries: 10,
                  requestTimeout: 60_000,
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {
              [mockUseCaseName]: {
                providerFailover: true,
              },
            },
            priority: ['test'],
            file: 'some/path',
            providers: {
              test: {
                defaults: {
                  [mockUseCaseName]: {
                    input: {},
                    retryPolicy: {
                      kind: OnFail.CIRCUIT_BREAKER,
                      maxContiguousRetries: 1,
                      requestTimeout: 1500,
                    },
                  },
                },
                mapRevision: undefined,
                mapVariant: undefined,
              },
            },
          },
        },
      });
      expect(superjson.mergeProfile(mockProfileName, mockProfileEntry)).toEqual(
        true
      );
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {
          [mockUseCaseName]: {
            input: {},
            providerFailover: true,
          },
        },
        file: 'some/path',
        priority: ['test'],
        providers: {
          test: {
            defaults: {
              [mockUseCaseName]: {
                input: {},
                retryPolicy: {
                  kind: OnFail.CIRCUIT_BREAKER,
                  maxContiguousRetries: 10,
                  requestTimeout: 60_000,
                  backoff: { kind: BackoffKind.EXPONENTIAL },
                },
              },
            },
            mapRevision: undefined,
            mapVariant: undefined,
          },
        },
      });
    });
  });

  describe('when setting profile', () => {
    type TestData = {
      from: {
        name: string;
        profile: ProfileEntry | undefined;
      };
      to: {
        name: string;
        profile: ProfileEntry | undefined;
      };
      expectedChanged: boolean;
    };

    const TEST_PROFILE_NAME = 'testprofile';

    it.each<TestData>([
      {
        from: {
          name: 'none',
          profile: undefined,
        },
        to: {
          name: 'version',
          profile: {
            version: '1.0.1',
          },
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'version',
          profile: {
            version: '1.0.1',
          },
        },
        to: {
          name: 'none',
          profile: undefined,
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'version',
          profile: {
            version: '1.0.1',
          },
        },
        to: {
          name: 'same version',
          profile: {
            version: '1.0.1',
          },
        },
        expectedChanged: expect.any(Boolean),
      },
      {
        from: {
          name: 'version',
          profile: {
            version: '1.0.1',
          },
        },
        to: {
          name: 'different version',
          profile: {
            version: '1.1.3',
          },
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          profile: 'file/path',
        },
        to: {
          name: 'version',
          profile: {
            version: '1.1.3',
          },
        },
        expectedChanged: true,
      },
    ])(
      'sets $from.name profile to $to.name profile',
      ({ from, to, expectedChanged }) => {
        const profiles: SuperJsonDocument['profiles'] = {};
        if (from.profile !== undefined) {
          profiles[TEST_PROFILE_NAME] = from.profile;
        }
        superjson = new SuperJson({ profiles });

        expect(
          superjson.setProfile(TEST_PROFILE_NAME, to.profile)
        ).toStrictEqual(expectedChanged);

        let expected: SuperJsonDocument = {};
        if (to.profile !== undefined) {
          expected = {
            profiles: {
              [TEST_PROFILE_NAME]: to.profile,
            },
          };
        }

        expect(superjson.document).toStrictEqual(expected);
        expect(superjson.document.providers).toBeUndefined();
      }
    );

    it('preserves existing profiles when deleting', () => {
      superjson = new SuperJson({
        profiles: {
          [TEST_PROFILE_NAME]: {
            version: '1.0.0',
          },
          otherProfile: {
            version: '0.0.1',
          },
        },
      });

      expect(superjson.setProfile(TEST_PROFILE_NAME, undefined)).toStrictEqual(
        true
      );

      expect(superjson.document).toStrictEqual({
        profiles: {
          otherProfile: {
            version: '0.0.1',
          },
        },
      });
    });
  });

  describe('when merging profile provider', () => {
    it('merges mutliple profile provider', () => {
      const mockProfileName = 'profile';
      let mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
        version: '0.0.0',
      });

      mockProviderName = 'second-provider';

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);

      expect(superjson.normalized.profiles).toEqual({
        profile: {
          defaults: {},
          priority: ['provider', mockProviderName],
          providers: {
            provider: {
              defaults: {},
              file: 'some/path',
            },
            ['second-provider']: {
              defaults: {},
              file: 'some/path',
            },
          },
          version: '0.0.0',
        },
      });
    });

    it('merges profile provider to empty super.json using uri path', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
        version: '0.0.0',
      });
    });

    it('merges profile provider to super.json without profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: { defaults: {}, file: 'some/path' },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
    });

    it('merges profile provider to super.json with empty profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: { [mockProviderName]: {} },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
    });

    it('merges profile provider to super.json with profile provider using uri path correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = 'file://some/path';

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'some/path',
          },
        },
      });
    });

    it('merges profile provider to super.json with profile provider using entry correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        file: 'provider/path',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'provider/path',
          },
        },
      });
    });

    it('merges profile provider to super.json with profile provider using map variant correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        mapVariant: 'test',
        mapRevision: 'test',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
                defaults: { input: { input: { test: 'test' } } },
              },
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapVariant: 'test',
            mapRevision: 'test',
          },
        },
      });
    });

    it('merges profile provider to super.json with string profile provider correctly', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        mapVariant: 'test',
        mapRevision: 'test',
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: '0.0.0',
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            mapVariant: 'test',
            mapRevision: 'test',
          },
        },
      });
    });

    it('merges profile provider to super.json with exisitng profile provider but without defaults', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {
        defaults: { input: { input: { test: 'test' } } },
      };

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
              },
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(true);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {
              input: {
                input: { test: 'test' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
            file: 'provider/path',
          },
        },
      });
    });

    it('returns false if super.json wasnt updated', () => {
      const mockProfileName = 'profile';
      const mockProviderName = 'provider';
      const mockProfileProviderEntry: ProfileProviderEntry = {};

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              [mockProviderName]: {
                file: 'provider/path',
              },
            },
          },
        },
      });

      expect(
        superjson.mergeProfileProvider(
          mockProfileName,
          mockProviderName,
          mockProfileProviderEntry
        )
      ).toEqual(false);
      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        file: 'some/path',
        priority: [mockProviderName],
        providers: {
          [mockProviderName]: {
            defaults: {},
            file: 'provider/path',
          },
        },
      });
    });
  });

  describe('when setting profile provider', () => {
    type TestData = {
      from: {
        name: string;
        profileProvider: ProfileProviderEntry | undefined;
      };
      to: {
        name: string;
        profileProvider: ProfileProviderEntry | undefined;
      };
      expectedChanged: boolean;
    };

    const TEST_PROFILE_NAME = 'testprofile';
    const TEST_PROFILE_PROVIDER = 'testprovider';

    it.each<TestData>([
      {
        from: {
          name: 'none',
          profileProvider: undefined,
        },
        to: {
          name: 'file',
          profileProvider: {
            file: 'path',
          },
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'none',
          profileProvider: undefined,
        },
        to: {
          name: 'empty',
          profileProvider: {},
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          profileProvider: {
            file: 'path',
          },
        },
        to: {
          name: 'same file',
          profileProvider: {
            file: 'path',
          },
        },
        expectedChanged: expect.any(Boolean),
      },
      {
        from: {
          name: 'file',
          profileProvider: {
            file: 'path',
          },
        },
        to: {
          name: 'mapVariant',
          profileProvider: {
            mapVariant: 'variant',
          },
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          profileProvider: {
            file: 'path',
          },
        },
        to: {
          name: 'none',
          profileProvider: undefined,
        },
        expectedChanged: true,
      },
    ])(
      'sets $from.name profile provider to $to.name profile provider',
      ({ from, to, expectedChanged }) => {
        const profileEntry: ProfileSettings = {
          version: '0.0.0',
        };
        if (from.profileProvider !== undefined) {
          profileEntry.providers = {
            [TEST_PROFILE_PROVIDER]: from.profileProvider,
          };
          profileEntry.priority = [TEST_PROFILE_PROVIDER];
        }
        superjson = new SuperJson({
          profiles: {
            [TEST_PROFILE_NAME]: profileEntry,
          },
        });

        expect(
          superjson.setProfileProvider(
            TEST_PROFILE_NAME,
            TEST_PROFILE_PROVIDER,
            to.profileProvider
          )
        ).toStrictEqual(expectedChanged);

        let expected = {};
        if (to.profileProvider !== undefined) {
          expected = {
            priority: [TEST_PROFILE_PROVIDER],
            providers: {
              [TEST_PROFILE_PROVIDER]: to.profileProvider,
            },
          };
        }

        expect(superjson.document).toStrictEqual({
          profiles: {
            [TEST_PROFILE_NAME]: {
              version: '0.0.0',
              ...expected,
            },
          },
        });
      }
    );

    it('preserves existing profile providers when deleting', () => {
      superjson = new SuperJson({
        profiles: {
          [TEST_PROFILE_NAME]: {
            version: '0.0.0',
            priority: [TEST_PROFILE_PROVIDER, 'otherProvider'],
            providers: {
              [TEST_PROFILE_PROVIDER]: {},
              otherProvider: {},
            },
          },
        },
      });

      expect(
        superjson.setProfileProvider(
          TEST_PROFILE_NAME,
          TEST_PROFILE_PROVIDER,
          undefined
        )
      ).toStrictEqual(true);

      expect(superjson.document).toStrictEqual({
        profiles: {
          [TEST_PROFILE_NAME]: {
            version: '0.0.0',
            priority: ['otherProvider'],
            providers: {
              otherProvider: {},
            },
          },
        },
      });
    });

    it('preserves existing profile priority when overwriting', () => {
      superjson = new SuperJson({
        profiles: {
          [TEST_PROFILE_NAME]: {
            version: '0.0.0',
            priority: [TEST_PROFILE_PROVIDER, 'otherProvider'],
            providers: {
              [TEST_PROFILE_PROVIDER]: {},
              otherProvider: {},
            },
          },
        },
      });

      expect(
        superjson.setProfileProvider(TEST_PROFILE_NAME, TEST_PROFILE_PROVIDER, {
          file: 'file',
        })
      ).toStrictEqual(true);

      expect(superjson.document).toStrictEqual({
        profiles: {
          [TEST_PROFILE_NAME]: {
            version: '0.0.0',
            priority: [TEST_PROFILE_PROVIDER, 'otherProvider'],
            providers: {
              [TEST_PROFILE_PROVIDER]: { file: 'file' },
              otherProvider: {},
            },
          },
        },
      });
    });
  });

  describe('when swapping profile provider variant', () => {
    const PROFILE = 'profile';

    beforeEach(() => {
      superjson = new SuperJson({
        profiles: {
          [PROFILE]: {
            defaults: {},
            file: 'path',
            providers: {
              localShort: 'file://path',
              local: {
                file: 'path',
                defaults: {
                  usecase: {
                    input: {
                      hello: 1,
                    },
                  },
                },
              },
              remoteShort: {
                mapVariant: 'variant',
              },
              remote: {
                defaults: {
                  usecase2: {
                    input: {
                      hello: 1,
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it.each<{
      name: string;
      provider: string;
      variant: Parameters<SuperJson['swapProfileProviderVariant']>[2];
      expected: [boolean, ProfileProviderEntry];
    }>([
      {
        name: 'local short to remote',
        provider: 'localShort',
        variant: { kind: 'remote' },
        expected: [true, {}],
      },
      {
        name: 'local short to local',
        provider: 'localShort',
        variant: { kind: 'local', file: 'path' },
        expected: [false, 'file://path'],
      },
      {
        name: 'local to remote',
        provider: 'local',
        variant: { kind: 'remote', mapVariant: 'default' },
        expected: [
          true,
          {
            mapVariant: 'default',
            defaults: {
              usecase: {
                input: {
                  hello: 1,
                },
              },
            },
          },
        ],
      },
      {
        name: 'local to local',
        provider: 'local',
        variant: { kind: 'local', file: 'new/path' },
        expected: [
          true,
          {
            file: 'new/path',
            defaults: {
              usecase: {
                input: {
                  hello: 1,
                },
              },
            },
          },
        ],
      },
      {
        name: 'remote short to local',
        provider: 'remoteShort',
        variant: { kind: 'local', file: 'new/path' },
        expected: [true, 'file://./new/path'],
      },
      {
        name: 'remote to local',
        provider: 'remote',
        variant: { kind: 'local', file: 'new/path' },
        expected: [
          true,
          {
            file: 'new/path',
            defaults: {
              usecase2: {
                input: {
                  hello: 1,
                },
              },
            },
          },
        ],
      },
      {
        name: 'remote to remote',
        provider: 'remote',
        variant: { kind: 'remote', mapRevision: 'some' },
        expected: [
          true,
          {
            mapRevision: 'some',
            defaults: {
              usecase2: {
                input: {
                  hello: 1,
                },
              },
            },
          },
        ],
      },
      {
        name: 'remote short to remote',
        provider: 'remoteShort',
        variant: { kind: 'remote', mapVariant: 'variant' },
        expected: [false, { mapVariant: 'variant' }],
      },
      {
        name: 'non-exitent to remote',
        provider: 'non-existent',
        variant: { kind: 'remote' },
        expected: [true, {}],
      },
      {
        name: 'non-exitent to local',
        provider: 'non-existent',
        variant: { kind: 'local', file: 'new/path' },
        expected: [true, 'file://./new/path'],
      },
    ])('swaps $name', ({ name: _name, provider, variant, expected }) => {
      expect(
        superjson.swapProfileProviderVariant(PROFILE, provider, variant)
      ).toEqual(expected[0]);
      expect(
        (
          superjson.document.profiles?.[PROFILE] as Exclude<
            ProfileEntry,
            string
          >
        ).providers?.[provider]
      ).toEqual(expected[1]);
    });
  });

  describe('when merging provider', () => {
    it('merges provider using uri path correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [],
        parameters: {},
      });
    });

    it('merges multiple providers', () => {
      let mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers).toEqual({
        [mockProviderName]: {
          file: 'some/path',
          security: [],
          parameters: {},
        },
      });

      mockProviderName = 'second-provider';

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers).toEqual({
        provider: {
          file: 'some/path',
          security: [],
          parameters: {},
        },
        ['second-provider']: {
          file: 'some/path',
          security: [],
          parameters: {},
        },
      });
    });

    it('merges provider using uri path with existing targed provider correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'file://some/path';
      superjson = new SuperJson({
        providers: {
          [mockProviderName]: 'targed/provider/path',
        },
      });

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [],
        parameters: {},
      });
    });

    it('merges provider using provider entry correctly', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = {
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
        parameters: {
          first: 'test',
        },
      };

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
        parameters: {
          first: 'test',
        },
      });
    });

    it('merges provider over existing provider parameters', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = {
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
        parameters: {
          first: 'new',
          second: 'second',
        },
      };
      superjson = new SuperJson({
        providers: {
          [mockProviderName]: {
            file: 'some/path',
            security: [
              {
                id: 'api-id',
                apikey: 'api-key',
              },
            ],
            parameters: {
              first: 'old',
              second: 'second',
              other: '',
            },
          },
        },
      });

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
        parameters: {
          first: 'new',
          second: 'second',
          other: '',
        },
      });
    });

    it('merges provider over existing file shorthand', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = {
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
      };
      superjson = new SuperJson({
        providers: {
          [mockProviderName]: 'targed/provider/path',
        },
      });

      superjson.mergeProvider(mockProviderName, mockProviderEntry);
      expect(superjson.normalized.providers[mockProviderName]).toEqual({
        file: 'some/path',
        security: [
          {
            id: 'api-id',
            apikey: 'api-key',
          },
        ],
        parameters: {},
      });
    });

    it('throws error on invalid string payload', () => {
      const mockProviderName = 'provider';
      const mockProviderEntry: ProviderEntry = 'made-up';

      expect(() =>
        superjson.mergeProvider(mockProviderName, mockProviderEntry)
      ).toThrowError(new Error('Invalid string payload format'));
    });
  });

  describe('when setting provider', () => {
    type TestData = {
      from: {
        name: string;
        provider: ProviderEntry | undefined;
      };
      to: {
        name: string;
        provider: ProviderEntry | undefined;
      };
      expectedChanged: boolean;
    };

    const TEST_PROVIDER_NAME = 'testprovider';

    it.each<TestData>([
      {
        from: {
          name: 'none',
          provider: undefined,
        },
        to: {
          name: 'file',
          provider: {
            file: 'path',
          },
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          provider: {
            file: 'path',
          },
        },
        to: {
          name: 'none',
          provider: undefined,
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          provider: {
            file: 'path',
          },
        },
        to: {
          name: 'empty',
          provider: {},
        },
        expectedChanged: true,
      },
      {
        from: {
          name: 'file',
          provider: {
            file: 'path',
          },
        },
        to: {
          name: 'same file',
          provider: {
            file: 'path',
          },
        },
        expectedChanged: expect.any(Boolean),
      },
    ])(
      'sets $from.name provider to $to.name provider',
      ({ from, to, expectedChanged }) => {
        const providers: SuperJsonDocument['providers'] = {};
        if (from.provider !== undefined) {
          providers[TEST_PROVIDER_NAME] = from.provider;
        }
        superjson = new SuperJson({ providers });

        expect(
          superjson.setProvider(TEST_PROVIDER_NAME, to.provider)
        ).toStrictEqual(expectedChanged);

        let expected: SuperJsonDocument = {};
        if (to.provider !== undefined) {
          expected = {
            providers: {
              [TEST_PROVIDER_NAME]: to.provider,
            },
          };
        }

        expect(superjson.document).toStrictEqual(expected);
      }
    );

    it('preserves existing providers when deleting', () => {
      superjson = new SuperJson({
        providers: {
          [TEST_PROVIDER_NAME]: {},
          otherProvider: {
            file: 'path',
          },
        },
      });

      expect(
        superjson.setProvider(TEST_PROVIDER_NAME, undefined)
      ).toStrictEqual(true);

      expect(superjson.document).toStrictEqual({
        providers: {
          otherProvider: {
            file: 'path',
          },
        },
      });
    });
  });

  describe('when swapping provider variant', () => {
    beforeEach(() => {
      superjson = new SuperJson({
        providers: {
          localShort: 'file://path',
          local: {
            file: 'path',
            security: [
              {
                id: 'id',
                apikey: 'key',
              },
            ],
          },
          remoteShort: {},
          remote: {
            security: [
              {
                id: 'id2',
                apikey: 'key2',
              },
            ],
          },
        },
      });
    });

    it.each<{
      name: string;
      provider: string;
      variant: Parameters<SuperJson['swapProviderVariant']>[1];
      expected: [boolean, ProviderEntry];
    }>([
      {
        name: 'local short to remote',
        provider: 'localShort',
        variant: { kind: 'remote' },
        expected: [true, {}],
      },
      {
        name: 'local short to local',
        provider: 'localShort',
        variant: { kind: 'local', file: 'new/path' },
        expected: [true, 'file://./new/path'],
      },
      {
        name: 'local to remote',
        provider: 'local',
        variant: { kind: 'remote' },
        expected: [
          true,
          {
            security: [
              {
                id: 'id',
                apikey: 'key',
              },
            ],
          },
        ],
      },
      {
        name: 'local to local',
        provider: 'local',
        variant: { kind: 'local', file: 'path' },
        expected: [
          false,
          {
            file: 'path',
            security: [
              {
                id: 'id',
                apikey: 'key',
              },
            ],
          },
        ],
      },
      {
        name: 'remote short to local',
        provider: 'remoteShort',
        variant: { kind: 'local', file: 'new/path' },
        expected: [true, 'file://./new/path'],
      },
      {
        name: 'remote short to remote',
        provider: 'remoteShort',
        variant: { kind: 'remote' },
        expected: [false, {}],
      },
      {
        name: 'remote to local',
        provider: 'remote',
        variant: { kind: 'local', file: 'new/path' },
        expected: [
          true,
          {
            file: 'new/path',
            security: [
              {
                id: 'id2',
                apikey: 'key2',
              },
            ],
          },
        ],
      },
      {
        name: 'remote to remote',
        provider: 'remote',
        variant: { kind: 'remote' },
        expected: [
          false,
          {
            security: [
              {
                id: 'id2',
                apikey: 'key2',
              },
            ],
          },
        ],
      },
      {
        name: 'non-existent to local',
        provider: 'non-existent',
        variant: { kind: 'local', file: 'new/path' },
        expected: [true, 'file://./new/path'],
      },
      {
        name: 'non-existent to remote',
        provider: 'non-existent',
        variant: { kind: 'remote' },
        expected: [true, {}],
      },
    ])('swaps $name', ({ name: _name, provider, variant, expected }) => {
      expect(superjson.swapProviderVariant(provider, variant)).toEqual(
        expected[0]
      );
      expect(superjson.document.providers?.[provider]).toEqual(expected[1]);
    });
  });

  describe('when setting priority', () => {
    it('sets priority to empty super.json', () => {
      const mockProfileName = 'communication/send-email';
      const mockPriorityArray = ['first', 'second', 'third'];

      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(new RegExp(`Profile "${mockProfileName}" not found`));
    });

    it('sets priority to super.json - profile with shorthand notations', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: '1.2.3',
        },
      });
      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new RegExp(`Unable to set priority for "${mockProfileName}"`)
      );
    });

    it('sets priority to super.json - profile without profile providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
          },
        },
      });
      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new RegExp(`Unable to set priority for "${mockProfileName}"`)
      );
    });

    it('sets priority to super.json - some of providers are missing in profile providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
            },
          },
        },
      });
      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new RegExp(`Unable to set priority for "${mockProfileName}"`)
      );
    });

    it('sets priority to super.json - missing providers', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
      });
      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new RegExp(`Unable to set priority for "${mockProfileName}"`)
      );
    });

    it('sets priority to super.json - some of providers in priority array are missing in providers property', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
        },
      });
      expect(() =>
        superjson.setPriority(mockProfileName, mockPriorityArray)
      ).toThrowError(
        new RegExp(`Unable to set priority for "${mockProfileName}"`)
      );
    });

    it('sets priority to super.json - exisiting priority is same as new priority', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            priority: ['first', 'second', 'third'],
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
          third: {},
        },
      });
      expect(superjson.setPriority(mockProfileName, mockPriorityArray)).toEqual(
        false
      );
    });

    it('sets priority to super.json', () => {
      const mockProfileName = 'profile';
      const mockPriorityArray = ['first', 'second', 'third'];

      superjson = new SuperJson({
        profiles: {
          [mockProfileName]: {
            defaults: {},
            file: 'some/path',
            providers: {
              first: {},
              second: {},
              third: {},
            },
          },
        },
        providers: {
          first: {},
          second: {},
          third: {},
        },
      });
      expect(superjson.setPriority(mockProfileName, mockPriorityArray)).toEqual(
        true
      );

      expect(superjson.normalized.profiles[mockProfileName]).toEqual({
        defaults: {},
        priority: mockPriorityArray,
        providers: {
          first: {
            defaults: {},
          },
          second: {
            defaults: {},
          },
          third: {
            defaults: {},
          },
        },
        file: 'some/path',
      });
    });
  });
});
