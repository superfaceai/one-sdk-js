import {
  AstMetadata,
  MapASTNode,
  MapDocumentNode,
  MapHeaderNode,
} from '@superfaceai/ast';
import { parseMap, Source } from '@superfaceai/parser';
import { getLocal } from 'mockttp';

import { MockTimers } from '../../mock';
import { CrossFetch, NodeCrypto, NodeFileSystem } from '../../node';
import { Config } from '../config';
import { UnexpectedError } from '../errors';
import { ServiceSelector } from '../services';
import { MapInterpreter } from './map-interpreter';
import {
  HTTPError,
  JessieError,
  MapASTError,
  MappedError,
  MappedHTTPError,
} from './map-interpreter.errors';

const config = new Config(NodeFileSystem);
const mockServer = getLocal();
const timers = new MockTimers();
const crypto = new NodeCrypto();
const fetchInstance = new CrossFetch(timers);
const header: MapHeaderNode = {
  kind: 'MapHeader',
  profile: {
    name: 'example',
    version: {
      major: 0,
      minor: 0,
      patch: 0,
    },
  },
  provider: 'example',
};

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

const parseMapFromSource = (source: string) =>
  parseMap(
    new Source(
      `
      profile = "example@0.0"
      provider = "example"
      ` + source
    )
  );

describe('MapInterpreter errors', () => {
  describe('MapASTError', () => {
    it('should correctly resolve AST path from node', () => {
      const node: MapASTNode = {
        kind: 'JessieExpression',
        expression: '1 + 2',
      };
      const ast: MapDocumentNode = {
        astMetadata,
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['result'],
                    value: node,
                  },
                ],
              },
            ],
          },
        ],
      };

      const err = new MapASTError('Some map ast error', { node, ast });
      expect(err.astPath).toStrictEqual([
        'definitions[0]',
        'statements[0]',
        'assignments[0]',
        'value',
      ]);

      expect(err.toString()).toEqual(
        `MapASTError: Some map ast error
AST Path: definitions[0].statements[0].assignments[0].value`
      );
    });
  });

  describe('HTTPError', () => {
    it('should correctly resolve AST path from node', () => {
      const node: MapASTNode = {
        kind: 'JessieExpression',
        expression: '1 + 2',
      };
      const ast: MapDocumentNode = {
        astMetadata,
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['result'],
                    value: node,
                  },
                ],
              },
            ],
          },
        ],
      };

      const err = new HTTPError('Some http error', { node, ast }, 500, {
        url: 'https://my-site.com/',
        headers: {
          'content-type': 'json',
          Authorization: 'bearer jasldfhasfklgj',
        },
      });
      expect(err.astPath).toStrictEqual([
        'definitions[0]',
        'statements[0]',
        'assignments[0]',
        'value',
      ]);

      expect(err.toString()).toEqual(
        `HTTPError: Some http error
AST Path: definitions[0].statements[0].assignments[0].value`
      );
    });
  });

  describe('JessieError', () => {
    it('should correctly resolve AST path from node', () => {
      const node: MapASTNode = {
        kind: 'JessieExpression',
        expression: '1 + 2',
      };
      const ast: MapDocumentNode = {
        astMetadata,
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['result'],
                    value: node,
                  },
                ],
              },
            ],
          },
        ],
      };

      const err = new JessieError(
        'Some jessie error',
        new Error('original error'),
        { node, ast }
      );
      expect(err.astPath).toStrictEqual([
        'definitions[0]',
        'statements[0]',
        'assignments[0]',
        'value',
      ]);

      expect(err.toString()).toEqual(
        `JessieError: Some jessie error
Error: original error
AST Path: definitions[0].statements[0].assignments[0].value`
      );
    });
  });

  describe('MapInterpreter', () => {
    let mockServicesSelector: ServiceSelector;

    beforeEach(async () => {
      await mockServer.start();
      mockServicesSelector = ServiceSelector.withDefaultUrl(mockServer.url);
    });

    afterEach(async () => {
      await mockServer.stop();
    });

    it('should fail with invalid AST', async () => {
      const interpreter = new MapInterpreter(
        {
          security: [],
          services: ServiceSelector.empty(),
        },
        { fetchInstance, config, crypto }
      );
      const result = await interpreter.perform({
        kind: 'Invalid',
      } as unknown as MapDocumentNode);
      expect(result.isErr() && result.error instanceof UnexpectedError).toEqual(
        true
      );
    });

    it('should fail on undefined usecase', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'nonexistent',
          security: [],
          services: ServiceSelector.empty(),
        },
        { fetchInstance, config, crypto }
      );
      const result = await interpreter.perform({
        astMetadata,
        kind: 'MapDocument',
        header,
        definitions: [],
      });
      expect(result.isErr()).toEqual(true);
    });

    it('should fail when trying to run undefined operation', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: ServiceSelector.empty(),
        },
        { fetchInstance, config, crypto }
      );
      const result = await interpreter.perform(
        parseMapFromSource(`
        map Test {
          result = call myBelovedOperation()
        }`)
      );
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Operation not found: myBelovedOperation');
    });

    it('should fail when calling an API with relative URL but not providing baseUrl', async () => {
      const url = '/twelve';
      await mockServer.get(url).thenJson(200, { data: 12 });
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: ServiceSelector.empty(),
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          http GET "${url}" {
            request {
              headers {
                "content-type" = "application/json"
              }
            }

            response 200 "application/json" "en-US" {
              result = body.data
            }
          }
        }`);
      const result = await interpreter.perform(ast);
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Base url for a service not provided for HTTP call.');
    });

    it('should fail when calling an API with path parameters and some are missing', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );

      const ast = parseMapFromSource(`
        map Test {
          page = input.page
          http GET "/{missing}/{alsoMissing}" {
            request {
              headers {
                "content-type" = "application/json"
              }
            }

            response 200 "application/json" "en-US" {
              result = body.data
            }
          }
        }`);
      const result = await interpreter.perform(ast);
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow(
        'Missing values for URL path replacement: missing, alsoMissing'
      );
    });

    it('should fail when calling an API with Basic auth, but with no credentials', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'testCase',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
          map testCase {
          http GET "/not/really/relevant" {
            security "nonexistent"

            response 200 {
              return map result body.data
            }
          }
        }`);
      const result = await interpreter.perform(ast);
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Security values for security scheme not found: nonexistent');
    });

    it('should map an error from API', async () => {
      const url = '/error';
      await mockServer
        .get(url)
        .thenJson(404, { 'Content-Type': 'application/json; charset=utf-8' });
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          http GET "${url}" {
            response 404 {
              map error {
                message = "Nothing was found"
              }
            }
          }
        }`);
      const result = await interpreter.perform(ast);

      expect(
        result.isErr() &&
          result.error instanceof MappedHTTPError &&
          result.error.statusCode
      ).toEqual(404);
    });

    it('should clean up after mapping an error from API', async () => {
      let clean = false;
      const url = '/error';
      const url2 = '/cleanup';
      await mockServer
        .get(url)
        .thenJson(404, { 'Content-Type': 'application/json; charset=utf-8' });
      await mockServer.post(url2).thenCallback(() => {
        clean = true;

        return { status: 204 };
      });
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          http GET "${url}" {
            response 404 {
              map error {
                message = "Nothing was found"
              }
            }
          }
          http POST "${url2}" {
          }
        }`);
      const result = await interpreter.perform(ast);

      expect(
        result.isErr() &&
          result.error instanceof MappedHTTPError &&
          result.error.properties
      ).toEqual({ message: 'Nothing was found' });
      expect(clean).toEqual(true);
    });

    it('should return Jessie error when there is error in Jessie (duh)', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: ServiceSelector.empty(),
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          result = undefinedVariable
        }`);
      const result = await interpreter.perform(ast);
      expect(result.isErr() && result.error instanceof JessieError).toEqual(
        true
      );
    });

    it('should map non-HTTP error from API', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          map error {
            message = "Nothing was found"
          }
        }`);
      const result = await interpreter.perform(ast);

      expect(result.isErr() && result.error instanceof MappedError).toBe(true);
    });

    it('should return an unmapped error from API', async () => {
      const url = '/error';
      await mockServer
        .get(url)
        .thenJson(404, { 'Content-Type': 'application/json; charset=utf-8' });
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: mockServicesSelector,
        },
        { fetchInstance, config, crypto }
      );
      const ast = parseMapFromSource(`
        map Test {
          http GET "${url}" {
            response 200 {
              map result {
                message = "Should not see this"
              }
            }
          }
        }`);
      const result = await interpreter.perform(ast);

      expect(
        result.isErr() &&
          result.error instanceof HTTPError &&
          result.error.statusCode
      ).toEqual(404);
    });

    it('should return error when using parameters in baseUrl, but they are not supplied', async () => {
      const url = '/twelve/something';
      await mockServer.get(url).thenJson(200, { data: 12 });
      const ast = parseMapFromSource(`
        map Test {
          http GET "/something" {
            response 200 "application/json" {
              map result {
                result = body.data
              }
            }
          }
        }`);
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
          services: ServiceSelector.withDefaultUrl(
            `${mockServicesSelector.getUrl()!}/{path}`
          ),
        },
        { fetchInstance, config, crypto }
      );
      const result = await interpreter.perform(ast);
      expect(result.isErr() && result.error.toString()).toMatch(
        'Missing values for URL path replacement: path'
      );
    });
  });

  it('should not allow inline calls to fail', async () => {
    const ast = parseMapFromSource(`
      map Test {
        call FirstOperation() {
            return map error if (outcome.error) outcome.error
            return map result { message = 'this is not to be seen' }
          }
      }

      operation FirstOperation {
        result = call foreach(_ of Array(1)) SecondOperation()

        return result
      }

      operation SecondOperation {
        fail 'this should not be allowed to fail'
      }
  `);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.empty(),
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);

    expect(result.isErr() && result.error.toString()).toMatch(
      'Unexpected inline call failure'
    );
  });

  it('should properly pass error from nested operation calls', async () => {
    const ast = parseMapFromSource(`
      map Test {
        call FirstOperation() {
            return map error if (outcome.error) outcome.error
            return map result { message = 'this is not to be seen' }
          }
      }

      operation FirstOperation {
        call SecondOperation() {
          fail if (outcome.error) outcome.error
        }
      }

      operation SecondOperation {
        fail 'the best error in the world'
      }
  `);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.empty(),
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);

    expect(result.isErr() && result.error.toString()).toMatch(
      'the best error in the world'
    );
  });

  it('should properly pass error from nested operation calls in loops', async () => {
    const ast = parseMapFromSource(`
      map Test {
        call FirstOperation() {
            return map error if (outcome.error) outcome.error
            return map result { message = 'this is not to be seen' }
          }
      }

      operation FirstOperation {
        call foreach(_ of Array(1)) SecondOperation() {
          fail if (outcome.error) outcome.error
        }
      }

      operation SecondOperation {
        fail 'the best error in the world'
      }
  `);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.empty(),
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);
    expect(result.isErr() && result.error.toString()).toMatch(
      'the best error in the world'
    );
  });
});
