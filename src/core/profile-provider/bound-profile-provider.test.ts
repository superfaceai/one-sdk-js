import type {
  AstMetadata,
  MapDocumentNode,
  ProfileDocumentNode,
  ProviderJson,
} from '@superfaceai/ast';
import {
  ApiKeyPlacement,
  HttpScheme,
  OnFail,
  SecurityType,
} from '@superfaceai/ast';

import { err, ok } from '../../lib';
import { MockTimers } from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem } from '../../node';
import { Config } from '../config';
import {
  InputValidationError,
  MapASTError,
  MapInterpreter,
  ProfileParameterValidator,
  ResultValidationError,
} from '../interpreter';
import { ServiceSelector } from '../services';
import { BoundProfileProvider } from './bound-profile-provider';

jest.mock('../interpreter/map-interpreter');

const mockConfig = new Config(NodeFileSystem);
const crypto = new NodeCrypto();
const timers = new MockTimers();

const astMetadata: AstMetadata = {
  sourceChecksum: 'checksum',
  astVersion: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  parserVersion: {
    major: 1,
    minor: 0,
    patch: 0,
  },
};

const mockMapDocument: MapDocumentNode = {
  astMetadata,
  kind: 'MapDocument',
  header: {
    kind: 'MapHeader',
    profile: {
      name: 'different-test-profile',
      scope: 'some-map-scope',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
      },
    },
    provider: 'test',
  },
  definitions: [],
};

const mockProfileDocument: ProfileDocumentNode = {
  astMetadata,
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

const mockProviderJson: ProviderJson = {
  name: 'test',
  services: [{ id: 'test-service', baseUrl: 'service/base/url' }],
  securitySchemes: [
    {
      type: SecurityType.HTTP,
      id: 'basic',
      scheme: HttpScheme.BASIC,
    },
    {
      id: 'api',
      type: SecurityType.APIKEY,
      in: ApiKeyPlacement.HEADER,
      name: 'Authorization',
    },
    {
      id: 'bearer',
      type: SecurityType.HTTP,
      scheme: HttpScheme.BEARER,
      bearerFormat: 'some',
    },
    {
      id: 'digest',
      type: SecurityType.HTTP,
      scheme: HttpScheme.DIGEST,
    },
  ],
  defaultService: 'test-service',
};

describe('BoundProfileProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when performing', () => {
    it('returns correct object', async () => {
      const validateSpy = jest
        .spyOn(ProfileParameterValidator.prototype, 'validate')
        .mockReturnValue(ok(undefined));
      const performSpy = jest
        .spyOn(MapInterpreter.prototype, 'perform')
        .mockResolvedValue(ok('test'));

      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        mockConfig,
        {
          services: ServiceSelector.withDefaultUrl('test/url'),
          security: [],
        },
        crypto,
        new NodeFetch(timers)
      );

      await expect(
        mockBoundProfileProvider.perform<undefined, string>('test-usecase')
      ).resolves.toEqual(ok('test'));

      expect(validateSpy).toHaveBeenCalledTimes(2);
      expect(validateSpy).toHaveBeenNthCalledWith(
        1,
        undefined,
        'input',
        'test-usecase'
      );
      expect(validateSpy).toHaveBeenNthCalledWith(
        2,
        'test',
        'result',
        'test-usecase'
      );

      expect(performSpy).toHaveBeenCalledTimes(1);
      expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
    });

    it('overrides security from super.json with custom security', async () => {
      jest
        .spyOn(ProfileParameterValidator.prototype, 'validate')
        .mockReturnValue(ok(undefined));

      const performSpy = jest
        .spyOn(MapInterpreter.prototype, 'perform')
        .mockResolvedValue(ok('test'));

      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        mockConfig,
        {
          services: ServiceSelector.withDefaultUrl('test/url'),
          security: [
            {
              apikey: 'original',
              id: 'api',
              type: SecurityType.APIKEY,
              in: ApiKeyPlacement.HEADER,
              name: 'Authorization',
            },
          ],
        },
        crypto,
        new NodeFetch(timers)
      );

      await expect(
        mockBoundProfileProvider.perform<undefined, string>(
          'test-usecase',
          undefined,
          undefined,
          [
            {
              apikey: 'new',
              id: 'api',
            },
          ]
        )
      ).resolves.toEqual(ok('test'));

      expect(MapInterpreter).toBeCalledWith(
        {
          input: undefined,
          parameters: undefined,
          security: [
            {
              apikey: 'new',
              id: 'api',
              type: SecurityType.APIKEY,
              in: ApiKeyPlacement.HEADER,
              name: 'Authorization',
            },
          ],
          services: expect.any(Object),
          usecase: 'test-usecase',
        },
        expect.any(Object)
      );

      expect(performSpy).toHaveBeenCalledTimes(1);
      expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
    });

    it('returns error when input is not valid', async () => {
      const validateSpy = jest
        .spyOn(ProfileParameterValidator.prototype, 'validate')
        .mockReturnValue(err(new InputValidationError()));
      const performSpy = jest.spyOn(MapInterpreter.prototype, 'perform');

      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        mockConfig,
        {
          services: ServiceSelector.withDefaultUrl('test/url'),
          security: [],
        },
        crypto,
        new NodeFetch(timers)
      );

      await expect(
        mockBoundProfileProvider.perform<undefined, string>('test-usecase')
      ).resolves.toEqual(err(new InputValidationError()));

      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(validateSpy).toHaveBeenCalledWith(
        undefined,
        'input',
        'test-usecase'
      );

      expect(performSpy).not.toHaveBeenCalled();
    });

    it('returns error when result is not valid', async () => {
      const validateSpy = jest
        .spyOn(ProfileParameterValidator.prototype, 'validate')
        .mockReturnValueOnce(ok(undefined))
        .mockReturnValueOnce(err(new ResultValidationError()));
      const performSpy = jest
        .spyOn(MapInterpreter.prototype, 'perform')
        .mockResolvedValue(ok('test'));

      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        mockConfig,
        {
          services: ServiceSelector.withDefaultUrl('test/url'),
          security: [],
        },
        crypto,
        new NodeFetch(timers)
      );

      await expect(
        mockBoundProfileProvider.perform<undefined, string>('test-usecase')
      ).resolves.toEqual(err(new ResultValidationError()));

      expect(validateSpy).toHaveBeenCalledTimes(2);
      expect(validateSpy).toHaveBeenNthCalledWith(
        1,
        undefined,
        'input',
        'test-usecase'
      );
      expect(validateSpy).toHaveBeenNthCalledWith(
        2,
        'test',
        'result',
        'test-usecase'
      );

      expect(performSpy).toHaveBeenCalledTimes(1);
      expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
    });

    it('returns error when there is an error during interpreter perform', async () => {
      const validateSpy = jest
        .spyOn(ProfileParameterValidator.prototype, 'validate')
        .mockReturnValue(ok(undefined));
      const performSpy = jest
        .spyOn(MapInterpreter.prototype, 'perform')
        .mockResolvedValue(err(new MapASTError('test-error')));

      const mockBoundProfileProvider = new BoundProfileProvider(
        mockProfileDocument,
        mockMapDocument,
        mockProviderJson,
        mockConfig,
        {
          services: ServiceSelector.withDefaultUrl('test/url'),
          security: [],
          profileProviderSettings: {
            defaults: {
              test: {
                input: { t: 't' },
                retryPolicy: { kind: OnFail.NONE },
              },
            },
          },
        },
        crypto,
        new NodeFetch(timers)
      );
      await expect(
        mockBoundProfileProvider.perform<undefined, string>('test')
      ).resolves.toEqual(err(new MapASTError('test-error')));

      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(validateSpy).toHaveBeenCalledWith({ t: 't' }, 'input', 'test');

      expect(performSpy).toHaveBeenCalledTimes(1);
      expect(performSpy).toHaveBeenCalledWith(mockMapDocument);
    });
  });
});
