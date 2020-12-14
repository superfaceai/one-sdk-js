import { MapDocumentNode } from '@superfaceai/language';
import { getLocal } from 'mockttp';

import { MapInterpreter } from './map-interpreter';

const mockServer = getLocal();

describe('MapInterpreter', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('should execute minimal Eval definition', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const ast: MapDocumentNode = {
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
                  value: {
                    kind: 'JessieExpression',
                    expression: '1 + 2',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(3);
  });

  it('should execute Eval definition with variables', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
                  key: ['x'],
                  value: {
                    kind: 'PrimitiveLiteral',
                    value: 5,
                  },
                },
              ],
            },
            {
              kind: 'SetStatement',
              assignments: [
                {
                  kind: 'Assignment',
                  key: ['result'],
                  value: {
                    kind: 'JessieExpression',
                    expression: 'x + 7',
                    source: 'x + 7',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should execute eval definition with jessie array', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
                    expression: '[1, 2, 3]',
                    source: '[1, 2, 3]',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual([1, 2, 3]);
  });

  it('should inline call predefined operation', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'OperationDefinition',
          name: 'TestOp',
          statements: [
            {
              kind: 'OutcomeStatement',
              terminateFlow: true,
              isError: false,
              value: {
                kind: 'PrimitiveLiteral',
                value: 12,
              },
            },
          ],
        },
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
                    operationName: 'TestOp',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call predefined operation', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'http://example.com/profile',
        },
        provider: {
          kind: 'Provider',
          providerId: 'http://example.com/provider',
        },
      },
      definitions: [
        {
          kind: 'OperationDefinition',
          name: 'TestOp',
          statements: [
            {
              kind: 'OutcomeStatement',
              isError: false,
              terminateFlow: true,
              value: {
                kind: 'PrimitiveLiteral',
                value: 5,
              },
            },
          ],
        },
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'CallStatement',
              operationName: 'TestOp',
              arguments: [],
              statements: [
                {
                  kind: 'OutcomeStatement',
                  isError: false,
                  terminateFlow: false,
                  value: {
                    kind: 'JessieExpression',
                    expression: 'outcome.data + 7',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should correctly resolve scope', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'OperationDefinition',
          name: 'TestOp',
          statements: [
            {
              kind: 'SetStatement',
              assignments: [
                {
                  kind: 'Assignment',
                  key: ['x'],
                  value: {
                    kind: 'PrimitiveLiteral',
                    value: 7,
                  },
                },
              ],
            },
            {
              kind: 'OutcomeStatement',
              terminateFlow: true,
              isError: false,
              value: {
                kind: 'JessieExpression',
                expression: 'x + 5',
              },
            },
          ],
        },
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
                  key: ['x'],
                  value: {
                    kind: 'PrimitiveLiteral',
                    value: 8,
                  },
                },
              ],
            },
            {
              kind: 'SetStatement',
              assignments: [
                {
                  kind: 'Assignment',
                  key: ['result'],
                  value: {
                    kind: 'InlineCall',
                    arguments: [],
                    operationName: 'TestOp',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API', async () => {
    await mockServer.get('/twelve').thenJson(
      200,
      { data: 12 },
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Language': 'en-US, en-CA',
      }
    );
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with relative URL', async () => {
    await mockServer.get('/twelve').thenJson(200, { data: 12 });
    const baseUrl = mockServer.urlFor('/twelve').replace('/twelve', '');
    const interpreter = new MapInterpreter({ usecase: 'Test', baseUrl });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'GET',
              url: '/twelve',
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with path parameters', async () => {
    await mockServer.get('/twelve/2').thenJson(200, { data: 144 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({
      usecase: 'Test',
      input: { page: '2' },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
              url: `${url}/{page}`,
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

    expect(result.isOk() && result.value).toEqual(144);
  });

  it('should call an API with parameters', async () => {
    await mockServer
      .get('/twelve')
      .withQuery({ page: 2 })
      .thenJson(200, { data: 144 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({
      usecase: 'Test',
      input: { page: 2 },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
                query: {
                  kind: 'ObjectLiteral',
                  fields: [
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

    expect(result.isOk() && result.value).toEqual(144);
  });

  it('should call an API with parameters and POST request', async () => {
    await mockServer
      .post('/checkBody')
      .withJsonBody({ anArray: [1, 2, 3] })
      .withHeaders({ someheader: 'hello' })
      .thenJson(201, { bodyOk: true, headerOk: true });
    const url = mockServer.urlFor('/checkBody');
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'https://example.com',
        },
        provider: {
          kind: 'Provider',
          providerId: 'https://example.com',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'POST',
              url,
              request: {
                kind: 'HttpRequest',
                headers: {
                  kind: 'ObjectLiteral',
                  fields: [
                    {
                      kind: 'Assignment',
                      key: ['someheader'],
                      value: {
                        kind: 'PrimitiveLiteral',
                        value: 'hello',
                      },
                    },
                  ],
                },
                body: {
                  kind: 'ObjectLiteral',
                  fields: [
                    {
                      kind: 'Assignment',
                      key: ['anArray'],
                      value: {
                        kind: 'JessieExpression',
                        expression: '[1, 2, 3]',
                      },
                    },
                  ],
                },
              },
              responseHandlers: [
                {
                  kind: 'HttpResponseHandler',
                  statusCode: 201,
                  statements: [
                    {
                      kind: 'SetStatement',
                      assignments: [
                        {
                          kind: 'Assignment',
                          key: ['result'],
                          value: {
                            kind: 'JessieExpression',
                            expression: 'body',
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

    expect(result.isOk() && result.value).toEqual({
      headerOk: true,
      bodyOk: true,
    });
  });

  it('should run multi step operation', async () => {
    await mockServer
      .get('/first')
      .thenJson(200, { firstStep: { someVar: 12 } });
    await mockServer.get('/second').thenJson(200, { secondStep: 5 });
    const url1 = mockServer.urlFor('/first');
    const url2 = mockServer.urlFor('/second');
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'HttpCallStatement',
              url: url1,
              method: 'GET',
              request: {
                kind: 'HttpRequest',
                contentType: 'application/json',
              },
              responseHandlers: [
                {
                  kind: 'HttpResponseHandler',
                  contentType: 'application/json',
                  statusCode: 200,
                  statements: [
                    {
                      kind: 'SetStatement',
                      assignments: [
                        {
                          kind: 'Assignment',
                          key: ['someVariable'],
                          value: {
                            kind: 'JessieExpression',
                            expression: 'body.firstStep.someVar',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'HttpCallStatement',
              url: url2,
              method: 'GET',
              responseHandlers: [
                {
                  kind: 'HttpResponseHandler',
                  statusCode: 200,
                  contentType: 'application/json',
                  statements: [
                    {
                      kind: 'SetStatement',
                      assignments: [
                        {
                          kind: 'Assignment',
                          key: ['someOtherVariable'],
                          value: {
                            kind: 'JessieExpression',
                            expression: 'body.secondStep',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'OutcomeStatement',
              terminateFlow: true,
              isError: false,
              value: {
                kind: 'JessieExpression',
                expression: 'someVariable * someOtherVariable',
              },
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual(12 * 5);
  });

  it('should call an API with Basic auth', async () => {
    await mockServer
      .get('/basic')
      .withHeaders({ Authorization: 'Basic bmFtZTpwYXNzd29yZA==' })
      .thenJson(200, { data: 12 });
    const url = mockServer.urlFor('/basic');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      auth: { basic: { username: 'name', password: 'password' } },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testMap',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'GET',
              url,
              request: {
                kind: 'HttpRequest',
                security: {
                  scheme: 'basic',
                },
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Bearer auth', async () => {
    await mockServer
      .get('/bearer')
      .withHeaders({ Authorization: 'Bearer SuperSecret' })
      .thenJson(200, { data: 12 });
    const url = mockServer.urlFor('/bearer');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      auth: { bearer: { token: 'SuperSecret' } },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testMap',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'GET',
              url,
              request: {
                kind: 'HttpRequest',
                security: {
                  scheme: 'bearer',
                },
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Apikey auth in header', async () => {
    await mockServer
      .get('/apikey')
      .withHeaders({ Key: 'SuperSecret' })
      .thenJson(200, { data: 12 });
    const url = mockServer.urlFor('/apikey');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      auth: { apikey: { key: 'SuperSecret' } },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testMap',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'GET',
              url,
              request: {
                kind: 'HttpRequest',
                security: {
                  scheme: 'apikey',
                  name: 'key',
                  placement: 'header',
                },
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Apikey auth in query', async () => {
    await mockServer
      .get('/apikey')
      .withQuery({ key: 'SuperSecret' })
      .thenJson(200, { data: 12 });
    const url = mockServer.urlFor('/apikey');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      auth: { apikey: { key: 'SuperSecret' } },
    });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testMap',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              method: 'GET',
              url,
              request: {
                kind: 'HttpRequest',
                security: {
                  scheme: 'apikey',
                  name: 'key',
                  placement: 'query',
                },
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with multipart/form-data body', async () => {
    await mockServer.post('/formdata').thenCallback(request => {
      if (
        request.body.text &&
        request.body.text.includes('formData') &&
        request.body.text.includes('myFormData') &&
        request.body.text.includes('is') &&
        request.body.text.includes('present')
      ) {
        return {
          json: { data: 12 },
          status: 201,
        };
      }

      return { json: { failed: true }, statusCode: 400 };
    });
    const url = mockServer.urlFor('/formdata');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testCase',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              url,
              method: 'POST',
              request: {
                kind: 'HttpRequest',
                contentType: 'multipart/form-data',
                body: {
                  kind: 'ObjectLiteral',
                  fields: [
                    {
                      kind: 'Assignment',
                      key: ['formData'],
                      value: {
                        kind: 'PrimitiveLiteral',
                        value: 'myFormData',
                      },
                    },
                    {
                      kind: 'Assignment',
                      key: ['is'],
                      value: {
                        kind: 'PrimitiveLiteral',
                        value: 'present',
                      },
                    },
                  ],
                },
              },
              responseHandlers: [
                {
                  kind: 'HttpResponseHandler',
                  statusCode: 201,
                  contentType: 'application/json',
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with application/x-www-form-urlencoded', async () => {
    await mockServer
      .post('/urlencoded')
      .withForm({ form: 'is', o: 'k' })
      .thenJson(201, { data: 12 });
    const url = mockServer.urlFor('/urlencoded');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'testCase',
          usecaseName: 'testCase',
          statements: [
            {
              kind: 'HttpCallStatement',
              url,
              method: 'POST',
              request: {
                kind: 'HttpRequest',
                contentType: 'application/x-www-form-urlencoded',
                body: {
                  kind: 'ObjectLiteral',
                  fields: [
                    {
                      kind: 'Assignment',
                      key: ['form'],
                      value: {
                        kind: 'PrimitiveLiteral',
                        value: 'is',
                      },
                    },
                    {
                      kind: 'Assignment',
                      key: ['o'],
                      value: {
                        kind: 'PrimitiveLiteral',
                        value: 'k',
                      },
                    },
                  ],
                },
              },
              responseHandlers: [
                {
                  kind: 'HttpResponseHandler',
                  statusCode: 201,
                  contentType: 'application/json',
                  contentLanguage: 'en-US',
                  statements: [
                    {
                      kind: 'OutcomeStatement',
                      isError: false,
                      terminateFlow: true,
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

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should execute Eval definition with nested result', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'hello!',
        },
        provider: {
          kind: 'Provider',
          providerId: 'hi!',
        },
      },
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
                  key: ['result', 'which', 'is', 'nested'],
                  value: {
                    kind: 'PrimitiveLiteral',
                    value: 12,
                  },
                },
                {
                  kind: 'Assignment',
                  key: ['result', 'which', 'is', 'also', 'nested'],
                  value: {
                    kind: 'PrimitiveLiteral',
                    value: 13,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isOk() && result.value).toEqual({
      which: { is: { nested: 12, also: { nested: 13 } } },
    });
  });

  it('should execute based on condition', async () => {
    const ast: MapDocumentNode = {
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'http://example.com/profile',
        },
        provider: {
          kind: 'Provider',
          providerId: 'http://example.com/provider',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'OutcomeStatement',
              isError: false,
              terminateFlow: false,
              condition: {
                kind: 'StatementCondition',
                expression: {
                  kind: 'JessieExpression',
                  expression: 'input.condition',
                },
              },
              value: {
                kind: 'PrimitiveLiteral',
                value: 7,
              },
            },
            {
              kind: 'OutcomeStatement',
              isError: false,
              terminateFlow: false,
              condition: {
                kind: 'StatementCondition',
                expression: {
                  kind: 'JessieExpression',
                  expression: '!input.condition',
                },
              },
              value: {
                kind: 'PrimitiveLiteral',
                value: 8,
              },
            },
          ],
        },
      ],
    };
    const interpreter1 = new MapInterpreter({
      usecase: 'Test',
      input: { condition: true },
    });
    const interpreter2 = new MapInterpreter({
      usecase: 'Test',
      input: { condition: false },
    });
    const result1 = await interpreter1.perform(ast);
    const result2 = await interpreter2.perform(ast);
    expect(result1.isOk() && result1.value).toEqual(7);
    expect(result2.isOk() && result2.value).toEqual(8);
  });

  it('should correctly construct result object', async () => {
    const interpreter = new MapInterpreter({ usecase: 'Test' });
    const result = await interpreter.perform({
      kind: 'MapDocument',
      map: {
        kind: 'Map',
        profileId: {
          kind: 'ProfileId',
          profileId: 'http://example.com/profile',
        },
        provider: {
          kind: 'Provider',
          providerId: 'http://example.com/provider',
        },
      },
      definitions: [
        {
          kind: 'MapDefinition',
          name: 'Test',
          usecaseName: 'Test',
          statements: [
            {
              kind: 'OutcomeStatement',
              isError: false,
              terminateFlow: true,
              value: {
                kind: 'ObjectLiteral',
                fields: [
                  {
                    kind: 'Assignment',
                    key: ['test', 'x'],
                    value: {
                      kind: 'PrimitiveLiteral',
                      value: 1,
                    },
                  },
                  {
                    kind: 'Assignment',
                    key: ['test', 'y'],
                    value: {
                      kind: 'PrimitiveLiteral',
                      value: 2,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.isOk() && result.value).toEqual({ test: { x: 1, y: 2 } });
  });
});
