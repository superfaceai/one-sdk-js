import { MapASTNode, MapDocumentNode, MapHeaderNode } from '@superfaceai/ast';
import { parseMap, Source } from '@superfaceai/parser';
import { getLocal } from 'mockttp';

import { CrossFetch } from '../../lib/fetch';
import { UnexpectedError } from '../errors';
import { MapInterpreter } from './map-interpreter';
import {
  HTTPError,
  JessieError,
  MapASTError,
  MappedHTTPError,
} from './map-interpreter.errors';

const mockServer = getLocal();
const fetchInstance = new CrossFetch();
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
    let serviceBaseUrl: string;
    beforeEach(async () => {
      await mockServer.start();
      serviceBaseUrl = mockServer.url;
    });

    afterEach(async () => {
      await mockServer.stop();
    });

    it('should fail with invalid AST', async () => {
      const interpreter = new MapInterpreter(
        {
          security: [],
        },
        { fetchInstance }
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
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
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
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['result'],
                    value: {
                      kind: 'InlineCall',
                      arguments: [],
                      operationName: 'my beloved operation',
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Operation not found: my beloved operation');
    });

    it('should fail when calling an API with relative URL but not providing baseUrl', async () => {
      const url = '/twelve';
      await mockServer.get(url).thenJson(200, { data: 12 });
      const interpreter = new MapInterpreter(
        {
          usecase: 'Test',
          security: [],
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url,
                request: {
                  kind: 'HttpRequest',
                  headers: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['content-type'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'application/json',
                        },
                      },
                    ],
                  },
                  security: [],
                },
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    statements: [
                      {
                        kind: 'SetStatement',
                        assignments: [
                          {
                            kind: 'Assignment',
                            key: ['result'],
                            value: {
                              kind: 'JessieExpression',
                              expression: 'body.data',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
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
          serviceBaseUrl,
        },
        { fetchInstance }
      );

      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['page'],
                    value: {
                      kind: 'JessieExpression',
                      expression: 'input.page',
                    },
                  },
                ],
              },
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url: `/{missing}/{alsoMissing}`,
                request: {
                  kind: 'HttpRequest',
                  headers: {
                    kind: 'ObjectLiteral',
                    fields: [
                      {
                        kind: 'Assignment',
                        key: ['content-type'],
                        value: {
                          kind: 'PrimitiveLiteral',
                          value: 'application/json',
                        },
                      },
                    ],
                  },
                  security: [],
                },
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    statements: [
                      {
                        kind: 'SetStatement',
                        assignments: [
                          {
                            kind: 'Assignment',
                            key: ['result'],
                            value: {
                              kind: 'JessieExpression',
                              expression: 'body.data',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
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
          serviceBaseUrl,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url: 'not really relevant',
                request: {
                  kind: 'HttpRequest',
                  security: [{ id: 'nonexistent' }],
                },
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 200,
                    statements: [
                      {
                        kind: 'OutcomeStatement',
                        terminateFlow: true,
                        isError: false,
                        value: {
                          kind: 'JessieExpression',
                          expression: 'body.data',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Security values for security scheme not found: nonexistent');
    });

    it('should fail when calling an API with Bearer auth, but with no credentials', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'testCase',
          security: [],
          serviceBaseUrl,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url: 'not really relevant',
                request: {
                  kind: 'HttpRequest',
                  security: [{ id: 'nonexistent' }],
                },
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 200,
                    statements: [
                      {
                        kind: 'OutcomeStatement',
                        terminateFlow: true,
                        isError: false,
                        value: {
                          kind: 'JessieExpression',
                          expression: 'body.data',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result.isErr()).toEqual(true);
      expect(() => {
        result.unwrap();
      }).toThrow('Security values for security scheme not found: nonexistent');
    });

    it('should fail when calling an API with Apikey auth, but with no credentials', async () => {
      const interpreter = new MapInterpreter(
        {
          usecase: 'testCase',
          security: [],
          serviceBaseUrl,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'testMap',
            usecaseName: 'testCase',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url: 'not really relevant',
                request: {
                  kind: 'HttpRequest',
                  security: [{ id: 'nonexistent' }],
                },
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 200,
                    statements: [
                      {
                        kind: 'OutcomeStatement',
                        terminateFlow: true,
                        isError: false,
                        value: {
                          kind: 'JessieExpression',
                          expression: 'body.data',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
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
          serviceBaseUrl,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url,
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 404,
                    statements: [
                      {
                        kind: 'OutcomeStatement',
                        isError: true,
                        terminateFlow: false,
                        value: {
                          kind: 'ObjectLiteral',
                          fields: [
                            {
                              kind: 'Assignment',
                              key: ['message'],
                              value: {
                                kind: 'PrimitiveLiteral',
                                value: 'Nothing was found',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

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
          serviceBaseUrl,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform({
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'HttpCallStatement',
                method: 'GET',
                url,
                responseHandlers: [
                  {
                    kind: 'HttpResponseHandler',
                    statusCode: 404,
                    statements: [
                      {
                        kind: 'OutcomeStatement',
                        isError: true,
                        terminateFlow: false,
                        value: {
                          kind: 'ObjectLiteral',
                          fields: [
                            {
                              kind: 'Assignment',
                              key: ['message'],
                              value: {
                                kind: 'PrimitiveLiteral',
                                value: 'Nothing was found',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
              {
                kind: 'HttpCallStatement',
                method: 'POST',
                url: url2,
                responseHandlers: [],
              },
            ],
          },
        ],
      });

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
        },
        { fetchInstance }
      );
      const ast: MapDocumentNode = {
        kind: 'MapDocument',
        header,
        definitions: [
          {
            kind: 'MapDefinition',
            name: 'Test',
            usecaseName: 'Test',
            statements: [
              {
                kind: 'SetStatement',
                assignments: [
                  {
                    kind: 'Assignment',
                    key: ['result'],
                    value: {
                      kind: 'JessieExpression',
                      expression: 'undefinedVariable',
                      source: 'undefinedVariable',
                      sourceMap: 'AAAA,IAAI,CAAC,GAAG,iBAAiB,CAAC',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = await interpreter.perform(ast);
      expect(result.isErr() && result.error instanceof JessieError).toEqual(
        true
      );
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
          serviceBaseUrl: `${serviceBaseUrl}/{path}`,
        },
        { fetchInstance }
      );
      const result = await interpreter.perform(ast);
      expect(result.isErr() && result.error.toString()).toMatch(
        'Missing values for URL path replacement: path'
      );
    });
  });
});
