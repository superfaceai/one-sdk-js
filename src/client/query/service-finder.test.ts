import { ProfileDocumentNode } from '@superfaceai/ast';
import { mocked } from 'ts-jest/utils';

import { SuperJson } from '../../internal/superjson';
import {
  InputConstraintsObject,
  ProviderConstraint,
  ProviderQueryConstraint,
  ResultConstraintsObject,
} from './constraints';
import { ProfileProvider } from './profile-provider';
import { fetchProviders } from './registry';
import { ServiceFinderQuery, TypedServiceFinderQuery } from './service-finder';

jest.mock('./registry');

describe('service finder', () => {
  const mockProfileDocument: ProfileDocumentNode = {
    kind: 'ProfileDocument',
    header: {
      kind: 'ProfileHeader',
      name: 'test-profile',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    definitions: [],
  };

  const mockRegistryProviderInfo1 = {
    url: 'http://mock/url',
    registryId: 'mock-registry',
    serviceUrl: 'http://mock/service/url',
    mappingUrl: 'http://mock/mapping/url',
    semanticProfile: 'mock-semantic-profile',
  };

  const mockRegistryProviderInfo2 = {
    url: 'http://second/mock/url',
    registryId: 'second-mock-registry',
    serviceUrl: 'http://second/mock/service/url',
    mappingUrl: 'http://second/mock/mapping/url',
    semanticProfile: 'second-mock-semantic-profile',
  };

  describe('find one provider', () => {
    it('finds first provider correctly without constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      await expect(mockServiceFinder.findFirst()).resolves.toEqual(
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        )
      );
    });

    it('finds first provider correctly with mustBe constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (q: ProviderQueryConstraint) =>
        q.mustBe(mockRegistryProviderInfo1.serviceUrl);

      await expect(
        mockServiceFinder.serviceProvider(fn).findFirst()
      ).resolves.toEqual(
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        )
      );
    });

    it('finds first provider correctly with mustBeOneOf constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (q: ProviderQueryConstraint) =>
        q.mustBeOneOf([mockRegistryProviderInfo2.serviceUrl]);

      await expect(
        mockServiceFinder.serviceProvider(fn).findFirst()
      ).resolves.toEqual(
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://second/mock/mapping/url',
          'http://second/mock/service/url'
        )
      );
    });

    it('throws error when unreachable code ise reached', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (_q: ProviderQueryConstraint) => {
        return { value: 'test' } as ProviderConstraint;
      };

      await expect(
        mockServiceFinder.serviceProvider(fn).findFirst()
      ).rejects.toEqual(new Error('Unreachable code reached😱'));
    });
  });

  describe('find providers', () => {
    it('finds providers correctly without constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      await expect(mockServiceFinder.find()).resolves.toEqual([
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        ),
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://second/mock/mapping/url',
          'http://second/mock/service/url'
        ),
      ]);
    });

    it('finds providers correctly with mustBe constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (q: ProviderQueryConstraint) =>
        q.mustBe(mockRegistryProviderInfo1.serviceUrl);

      await expect(
        mockServiceFinder.serviceProvider(fn).find()
      ).resolves.toEqual([
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        ),
      ]);
    });

    it('finds providers correctly with mustBeOneOf constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (q: ProviderQueryConstraint) =>
        q.mustBeOneOf([mockRegistryProviderInfo2.serviceUrl]);

      await expect(
        mockServiceFinder.serviceProvider(fn).find()
      ).resolves.toEqual([
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://second/mock/mapping/url',
          'http://second/mock/service/url'
        ),
      ]);
    });

    it('throws error when unreachable code ise reached', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);
      const mockServiceFinder = new ServiceFinderQuery(
        'test-profile-id',
        mockProfileDocument
      );

      const fn = (_q: ProviderQueryConstraint) => {
        return { value: 'test' } as ProviderConstraint;
      };

      await expect(
        mockServiceFinder.serviceProvider(fn).find()
      ).rejects.toEqual(new Error('Unreachable code reached😱'));
    });
  });

  describe('typed service finder', () => {
    it('finds first provider correctly without constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);

      type MockType = { value: string };
      const mockInputQueryConstraint: InputConstraintsObject<MockType> = {
        value: {
          mustAccept: (val: string) => ({
            name: 'test',
            type: 'mustAccept',
            value: val,
          }),
          mustAcceptOneOf: (vals: string[]) => ({
            name: 'test',
            type: 'mustAcceptOneOf',
            value: vals,
          }),
        },
      };

      const mockResultQueryConstraint: ResultConstraintsObject<MockType> = {
        value: {
          mustBePresent: () => ({
            type: 'mustBePresent',
            name: 'test',
          }),
        },
      };
      const mockServiceFinder = new TypedServiceFinderQuery(
        mockInputQueryConstraint,
        mockResultQueryConstraint,
        'test-profile-id',
        mockProfileDocument
      );

      await expect(mockServiceFinder.findFirst()).resolves.toEqual(
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        )
      );
    });

    it('finds providers correctly without constrains', async () => {
      mocked(fetchProviders).mockResolvedValue([
        mockRegistryProviderInfo1,
        mockRegistryProviderInfo2,
      ]);

      type MockType = { value: string };
      const mockInputQueryConstraint: InputConstraintsObject<MockType> = {
        value: {
          mustAccept: (val: string) => ({
            name: 'test',
            type: 'mustAccept',
            value: val,
          }),
          mustAcceptOneOf: (vals: string[]) => ({
            name: 'test',
            type: 'mustAcceptOneOf',
            value: vals,
          }),
        },
      };

      const mockResultQueryConstraint: ResultConstraintsObject<MockType> = {
        value: {
          mustBePresent: () => ({
            type: 'mustBePresent',
            name: 'test',
          }),
        },
      };
      const mockServiceFinder = new TypedServiceFinderQuery(
        mockInputQueryConstraint,
        mockResultQueryConstraint,
        'test-profile-id',
        mockProfileDocument
      );

      await expect(mockServiceFinder.find()).resolves.toEqual([
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://mock/mapping/url',
          'http://mock/service/url'
        ),
        new ProfileProvider(
          new SuperJson({}),
          mockProfileDocument,
          'http://second/mock/mapping/url',
          'http://second/mock/service/url'
        ),
      ]);
    });
  });
  //TODO: add with constraints test
});
