import { MapASTNode } from '@superindustries/language';
import {
  createServer,
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'http';
import { StringDecoder } from 'string_decoder';

import { MapInterpereter } from './map-interpreter';

const port = Math.floor(Math.random() * 64511 + 1024);

const listener: RequestListener = (
  req: IncomingMessage,
  res: ServerResponse
) => {
  const decoder = new StringDecoder('utf-8');
  let buffer = '';

  switch (`${req.method} ${req.url}`) {
    case 'GET /twelve':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ data: 12 }));
      res.end();
      break;

    case 'GET /twelve?page=2':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ data: 144 }));
      res.end();
      break;

    case 'GET /first':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ firstStep: { someVar: 12 } }));
      res.end();
      break;

    case 'GET /second':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ secondStep: 5 }));
      res.end();
      break;

    case 'POST /checkBody':
      req.on('data', data => (buffer += decoder.write(data)));

      req.on('end', () => {
        buffer += decoder.end();
        const body = JSON.parse(buffer);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.write(
          JSON.stringify({
            bodyOk: body.anArray.length === 3,
            headerOk: req.headers['someheader'] === 'hello',
          })
        );
        res.end();
      });
      break;

    default:
      throw new Error(
        `Invalid combination of url and method: ${req.url}, ${req.method}`
      );
  }
};

const server = createServer(listener);

describe('MapInterpreter', () => {
  let interpreter: MapInterpereter;

  beforeAll(() => {
    server.listen(port);
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    interpreter = new MapInterpereter();
  });

  it('should fail with invalid AST', async () => {
    await expect(
      async () =>
        await interpreter.visit(
          ({ kind: 'Invalid' } as unknown) as MapASTNode,
          {}
        )
    ).rejects.toThrow();
  });

  it('should execute minimal Eval definition', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'EvalDefinition',
                  outcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    returnDefinition: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'result',
                        right: {
                          kind: 'JSExpression',
                          expression: '12',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 12 });
  });

  it('should execute Eval definition with variables', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [
                  {
                    kind: 'VariableExpressionsDefinition',
                    left: 'x',
                    right: {
                      kind: 'JSExpression',
                      expression: '7',
                    },
                  },
                ],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'EvalDefinition',
                  outcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    returnDefinition: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'result',
                        right: {
                          kind: 'JSExpression',
                          expression: 'x + 5',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 12 });
  });

  it('should correctly resolve variable scope', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [
              {
                kind: 'VariableExpressionsDefinition',
                left: 'x',
                right: {
                  kind: 'JSExpression',
                  expression: '8',
                },
              },
            ],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [
                  {
                    kind: 'VariableExpressionsDefinition',
                    left: 'x',
                    right: {
                      kind: 'JSExpression',
                      expression: '7',
                    },
                  },
                ],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'EvalDefinition',
                  outcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    returnDefinition: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'result',
                        right: {
                          kind: 'JSExpression',
                          expression: 'x + 5',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 12 });
  });

  it('should run predefined operation', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'OperationCallDefinition',
                  arguments: [],
                  operationName: 'my beloved operation',
                  successOutcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    returnDefinition: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'result',
                        right: {
                          kind: 'JSExpression',
                          expression: 'variableFromOperation',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
          {
            kind: 'OperationDefinition',
            operationName: 'my beloved operation',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'step',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'EvalDefinition',
                  outcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    setDefinition: [
                      {
                        kind: 'VariableExpressionsDefinition',
                        left: 'variableFromOperation',
                        right: {
                          kind: 'JSExpression',
                          expression: '12',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 12 });
  });

  it('should call an API', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'NetworkOperationDefinition',
                  definition: {
                    kind: 'HTTPOperationDefinition',
                    variableExpressionsDefinition: [],
                    url: `http://localhost:${port}/twelve`,
                    method: 'GET',
                    responseDefinition: {
                      statusCode: 200,
                      contentType: 'application/json',
                      contentLanguage: 'en_US',
                      outcomeDefinition: {
                        kind: 'OutcomeDefinition',
                        resultDefinition: [
                          {
                            kind: 'MapExpressionsDefinition',
                            left: 'result',
                            right: {
                              kind: 'JSExpression',
                              expression: 'response.data',
                            },
                          },
                        ],
                      },
                    },
                    requestDefinition: {
                      body: [],
                      headers: [],
                      security: 'other',
                      queryParametersDefinition: [],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 12 });
  });

  it('should call an API with parameters', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [
              {
                kind: 'VariableExpressionsDefinition',
                left: 'pageNumber',
                right: {
                  kind: 'JSExpression',
                  expression: '2',
                },
              },
            ],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'NetworkOperationDefinition',
                  definition: {
                    kind: 'HTTPOperationDefinition',
                    variableExpressionsDefinition: [],
                    url: `http://localhost:${port}/twelve`,
                    method: 'GET',
                    responseDefinition: {
                      statusCode: 200,
                      contentType: 'application/json',
                      contentLanguage: 'en_US',
                      outcomeDefinition: {
                        kind: 'OutcomeDefinition',
                        resultDefinition: [
                          {
                            kind: 'MapExpressionsDefinition',
                            left: 'result',
                            right: {
                              kind: 'JSExpression',
                              expression: 'response.data',
                            },
                          },
                        ],
                      },
                    },
                    requestDefinition: {
                      body: [],
                      headers: [],
                      security: 'other',
                      queryParametersDefinition: [
                        {
                          kind: 'VariableExpressionsDefinition',
                          left: 'page',
                          right: {
                            kind: 'JSExpression',
                            expression: 'pageNumber',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({ result: 144 });
  });

  it('should call an API with parameters and POST request', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'testCase',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'oneAndOnlyStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                iterationDefinition: {
                  kind: 'IterationDefinition',
                },
                run: {
                  kind: 'NetworkOperationDefinition',
                  definition: {
                    kind: 'HTTPOperationDefinition',
                    variableExpressionsDefinition: [],
                    url: `http://localhost:${port}/checkBody`,
                    method: 'POST',
                    responseDefinition: {
                      statusCode: 201,
                      contentType: 'application/json',
                      contentLanguage: 'en_US',
                      outcomeDefinition: {
                        kind: 'OutcomeDefinition',
                        resultDefinition: [
                          {
                            kind: 'MapExpressionsDefinition',
                            left: 'result',
                            right: {
                              kind: 'JSExpression',
                              expression: 'response',
                            },
                          },
                        ],
                      },
                    },
                    requestDefinition: {
                      body: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'anArray',
                          right: {
                            kind: 'JSExpression',
                            expression: '[1, 2, 3]',
                          },
                        },
                      ],
                      headers: [
                        {
                          kind: 'VariableExpressionsDefinition',
                          left: 'SomeHeader',
                          right: {
                            kind: 'JSExpression',
                            expression: '"hello"',
                          },
                        },
                      ],
                      security: 'other',
                      queryParametersDefinition: [],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'testCase' }
    );

    expect(result).toEqual({
      result: {
        headerOk: true,
        bodyOk: true,
      },
    });
  });

  it('should run multi step operation', async () => {
    const result = await interpreter.visit(
      {
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
            mapName: 'testMap',
            usecaseName: 'multistep',
            variableExpressionsDefinition: [],
            stepsDefinition: [
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'firstStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                run: {
                  kind: 'NetworkOperationDefinition',
                  definition: {
                    kind: 'HTTPOperationDefinition',
                    variableExpressionsDefinition: [],
                    url: `http://localhost:${port}/first`,
                    method: 'get',
                    requestDefinition: {
                      queryParametersDefinition: [],
                      security: 'other',
                      headers: [],
                      body: [],
                    },
                    responseDefinition: {
                      statusCode: 200,
                      contentType: 'application/json',
                      contentLanguage: 'en_US',
                      outcomeDefinition: {
                        kind: 'OutcomeDefinition',
                        setDefinition: [
                          {
                            kind: 'VariableExpressionsDefinition',
                            left: 'someVariable',
                            right: {
                              kind: 'JSExpression',
                              expression: 'response.firstStep.someVar',
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
              {
                kind: 'StepDefinition',
                variableExpressionsDefinition: [],
                stepName: 'secondStep',
                condition: {
                  kind: 'JSExpression',
                  expression: 'true',
                },
                run: {
                  kind: 'NetworkOperationDefinition',
                  definition: {
                    kind: 'HTTPOperationDefinition',
                    variableExpressionsDefinition: [],
                    url: `http://localhost:${port}/second`,
                    method: 'get',
                    requestDefinition: {
                      queryParametersDefinition: [],
                      security: 'other',
                      headers: [],
                      body: [],
                    },
                    responseDefinition: {
                      statusCode: 200,
                      contentType: 'application/json',
                      contentLanguage: 'en_US',
                      outcomeDefinition: {
                        kind: 'OutcomeDefinition',
                        setDefinition: [
                          {
                            kind: 'VariableExpressionsDefinition',
                            left: 'someOtherVariable',
                            right: {
                              kind: 'JSExpression',
                              expression: 'response.secondStep',
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
              {
                kind: 'StepDefinition',
                condition: {
                  kind: 'JSExpression',
                  expression: `typeof someOtherVariable !== 'undefined' && someOtherVariable && someOtherVariable < 10 && typeof someVariable !== undefined && someVariable && someVariable > 10`,
                },
                variableExpressionsDefinition: [],
                stepName: 'thirdStep',
                run: {
                  kind: 'EvalDefinition',
                  outcomeDefinition: {
                    kind: 'OutcomeDefinition',
                    resultDefinition: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'result',
                        right: {
                          kind: 'JSExpression',
                          expression: 'someVariable * someOtherVariable',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      { usecase: 'multistep' }
    );

    expect(result).toEqual({ result: 12 * 5 });
  });
});
