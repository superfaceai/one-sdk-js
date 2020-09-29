import { MapASTNode } from '@superindustries/language';
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

  it('should fail with invalid AST', async () => {
    const interpreter = new MapInterpreter({});
    await expect(
      async () =>
        await interpreter.visit(({ kind: 'Invalid' } as unknown) as MapASTNode)
    ).rejects.toThrow();
  });

  it('should execute minimal Eval definition', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should fail on undefined usecase', async () => {
    const interpreter = new MapInterpreter({ usecase: 'nonexistent' });
    await expect(
      async () =>
        await interpreter.visit({
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
        })
    ).rejects.toThrow('Usecase not found.');
  });

  // This should not happen in practice, as the AST will be validated beforehand
  it('should fail when none of result/return/set are defined', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    await expect(
      async () =>
        await interpreter.visit({
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
                    },
                  },
                },
              ],
            },
          ],
        })
    ).rejects.toThrow('Something went very wrong, this should not happen!');
  });

  it('should execute Eval definition with variables', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should correctly resolve variable scope', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should run predefined operation', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should throw when trying to run undefined operation', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    await expect(
      async () =>
        await interpreter.visit({
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
              operationName: 'my not-so-beloved operation',
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
        })
    ).rejects.toThrow('Operation my beloved operation not found');
  });

  it('should call an API', async () => {
    await mockServer.get('/twelve').thenJson(200, { data: 12 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
                  url,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should call an API with relative URL', async () => {
    await mockServer.get('/twelve').thenJson(200, { data: 12 });
    const baseUrl = mockServer.urlFor('/twelve').replace('/twelve', '');
    const interpreter = new MapInterpreter({ usecase: 'testCase', baseUrl });
    const result = await interpreter.visit({
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
                  url: '/twelve',
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should throw when calling an API with relative URL but not providing baseUrl', async () => {
    await mockServer.get('/twelve').thenJson(200, { data: 12 });
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    await expect(
      async () =>
        await interpreter.visit({
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
                      url: '/twelve',
                      method: 'GET',
                      responseDefinition: {
                        statusCode: 200,
                        contentType: 'application/json',
                        contentLanguage: 'en-US',
                        outcomeDefinition: {
                          kind: 'OutcomeDefinition',
                          resultDefinition: [
                            {
                              kind: 'MapExpressionsDefinition',
                              left: 'result',
                              right: {
                                kind: 'JSExpression',
                                expression: 'body.data',
                              },
                            },
                          ],
                        },
                      },
                      requestDefinition: {
                        contentType: 'application/json',
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
        })
    ).rejects.toThrow('Relative URL specified, but base URL not provided!');
  });

  it('should call an API with path parameters', async () => {
    await mockServer.get('/twelve/2').thenJson(200, { data: 144 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      input: { page: '2' },
    });
    const result = await interpreter.visit({
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
              stepName: 'settingStep',
              condition: {
                kind: 'JSExpression',
                expression: 'true',
              },
              run: {
                kind: 'EvalDefinition',
                outcomeDefinition: {
                  kind: 'OutcomeDefinition',
                  setDefinition: [
                    {
                      kind: 'VariableExpressionsDefinition',
                      left: 'page',
                      right: {
                        kind: 'JSExpression',
                        expression: 'input.page',
                      },
                    },
                  ],
                },
              },
            },
            {
              kind: 'StepDefinition',
              variableExpressionsDefinition: [],
              stepName: 'httpCallStep',
              condition: {
                kind: 'JSExpression',
                expression: 'true',
              },
              run: {
                kind: 'NetworkOperationDefinition',
                definition: {
                  kind: 'HTTPOperationDefinition',
                  variableExpressionsDefinition: [],
                  url: `${url}/{page}`,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({ result: 144 });
  });

  it('should throw when calling an API with path parameters and some are missing', async () => {
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
    });

    await expect(
      async () =>
        await interpreter.visit({
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
                  stepName: 'settingStep',
                  condition: {
                    kind: 'JSExpression',
                    expression: 'true',
                  },
                  run: {
                    kind: 'EvalDefinition',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      setDefinition: [
                        {
                          kind: 'VariableExpressionsDefinition',
                          left: 'page',
                          right: {
                            kind: 'JSExpression',
                            expression: '2',
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  kind: 'StepDefinition',
                  variableExpressionsDefinition: [],
                  stepName: 'httpCallStep',
                  condition: {
                    kind: 'JSExpression',
                    expression: 'true',
                  },
                  run: {
                    kind: 'NetworkOperationDefinition',
                    definition: {
                      kind: 'HTTPOperationDefinition',
                      variableExpressionsDefinition: [],
                      url: `//some.url/{missing}/{page}/{alsoMissing}`,
                      method: 'GET',
                      responseDefinition: {
                        statusCode: 200,
                        contentType: 'application/json',
                        contentLanguage: 'en-US',
                        outcomeDefinition: {
                          kind: 'OutcomeDefinition',
                          resultDefinition: [
                            {
                              kind: 'MapExpressionsDefinition',
                              left: 'result',
                              right: {
                                kind: 'JSExpression',
                                expression: 'body.data',
                              },
                            },
                          ],
                        },
                      },
                      requestDefinition: {
                        contentType: 'application/json',
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
        })
    ).rejects.toThrow(
      'Values for URL replacement keys not found: missing, alsoMissing'
    );
  });

  it('should call an API with parameters', async () => {
    await mockServer
      .get('/twelve')
      .withQuery({ page: 2 })
      .thenJson(200, { data: 144 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
                  url,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({ result: 144 });
  });

  it('should call an API with input', async () => {
    await mockServer
      .get('/twelve')
      .withQuery({ page: 2 })
      .thenJson(200, { data: 144 });
    const url = mockServer.urlFor('/twelve');
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
      input: { page: '2' },
    });
    const result = await interpreter.visit({
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
                expression: 'input.page',
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
                  url,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({ result: 144 });
  });

  it('should call an API with parameters and POST request', async () => {
    await mockServer
      .post('/checkBody')
      .withJsonBody({ anArray: [1, 2, 3] })
      .withHeaders({ someheader: 'hello' })
      .thenJson(201, { bodyOk: true, headerOk: true });
    const url = mockServer.urlFor('/checkBody');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
                  url,
                  method: 'POST',
                  responseDefinition: {
                    statusCode: 201,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
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
    });

    expect(result).toEqual({
      result: {
        headerOk: true,
        bodyOk: true,
      },
    });
  });

  it('should run multi step operation', async () => {
    await mockServer
      .get('/first')
      .thenJson(200, { firstStep: { someVar: 12 } });
    await mockServer.get('/second').thenJson(200, { secondStep: 5 });
    const url1 = mockServer.urlFor('/first');
    const url2 = mockServer.urlFor('/second');
    const interpreter = new MapInterpreter({ usecase: 'multistep' });
    const result = await interpreter.visit({
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
                  url: url1,
                  method: 'get',
                  requestDefinition: {
                    contentType: 'application/json',
                    queryParametersDefinition: [],
                    security: 'other',
                    headers: [],
                    body: [],
                  },
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      setDefinition: [
                        {
                          kind: 'VariableExpressionsDefinition',
                          left: 'someVariable',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.firstStep.someVar',
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
                  url: url2,
                  method: 'get',
                  requestDefinition: {
                    contentType: 'application/json',
                    queryParametersDefinition: [],
                    security: 'other',
                    headers: [],
                    body: [],
                  },
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      setDefinition: [
                        {
                          kind: 'VariableExpressionsDefinition',
                          left: 'someOtherVariable',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.secondStep',
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
    });

    expect(result).toEqual({ result: 12 * 5 });
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
    const result = await interpreter.visit({
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
                  url,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
                    body: [],
                    headers: [],
                    security: 'basic',
                    queryParametersDefinition: [],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ result: 12 });
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
    const result = await interpreter.visit({
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
                  url,
                  method: 'GET',
                  responseDefinition: {
                    statusCode: 200,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/json',
                    body: [],
                    headers: [],
                    security: 'bearer',
                    queryParametersDefinition: [],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ result: 12 });
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
    const result = await interpreter.visit({
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
                  url,
                  method: 'POST',
                  responseDefinition: {
                    statusCode: 201,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'multipart/form-data',
                    body: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'formData',
                        right: {
                          kind: 'JSExpression',
                          expression: '"myFormData"',
                        },
                      },
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'is',
                        right: {
                          kind: 'JSExpression',
                          expression: '"present"',
                        },
                      },
                    ],
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
    });

    expect(result).toEqual({ result: 12 });
  });

  it('should throw on an API with Basic auth, but without credentials', async () => {
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
    });
    await expect(
      async () =>
        await interpreter.visit({
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
                      url: '/unimportant',
                      method: 'GET',
                      responseDefinition: {
                        statusCode: 200,
                        contentType: 'application/json',
                        contentLanguage: 'en-US',
                        outcomeDefinition: {
                          kind: 'OutcomeDefinition',
                          resultDefinition: [
                            {
                              kind: 'MapExpressionsDefinition',
                              left: 'result',
                              right: {
                                kind: 'JSExpression',
                                expression: 'body.data',
                              },
                            },
                          ],
                        },
                      },
                      requestDefinition: {
                        contentType: 'application/json',
                        body: [],
                        headers: [],
                        security: 'basic',
                        queryParametersDefinition: [],
                      },
                    },
                  },
                },
              ],
            },
          ],
        })
    ).rejects.toThrow();
  });

  it('should throw on an API with Bearer auth, but without credentials', async () => {
    const interpreter = new MapInterpreter({
      usecase: 'testCase',
    });
    await expect(
      async () =>
        await interpreter.visit({
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
                      url: '/unimportant',
                      method: 'GET',
                      responseDefinition: {
                        statusCode: 200,
                        contentType: 'application/json',
                        contentLanguage: 'en-US',
                        outcomeDefinition: {
                          kind: 'OutcomeDefinition',
                          resultDefinition: [
                            {
                              kind: 'MapExpressionsDefinition',
                              left: 'result',
                              right: {
                                kind: 'JSExpression',
                                expression: 'body.data',
                              },
                            },
                          ],
                        },
                      },
                      requestDefinition: {
                        contentType: 'application/json',
                        body: [],
                        headers: [],
                        security: 'bearer',
                        queryParametersDefinition: [],
                      },
                    },
                  },
                },
              ],
            },
          ],
        })
    ).rejects.toThrow();
  });

  it('should call an API with application/x-www-form-urlencoded', async () => {
    await mockServer
      .post('/urlencoded')
      .withForm({ form: 'is', o: 'k' })
      .thenJson(201, { data: 12 });
    const url = mockServer.urlFor('/urlencoded');
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
                  url,
                  method: 'POST',
                  responseDefinition: {
                    statusCode: 201,
                    contentType: 'application/json',
                    contentLanguage: 'en-US',
                    outcomeDefinition: {
                      kind: 'OutcomeDefinition',
                      resultDefinition: [
                        {
                          kind: 'MapExpressionsDefinition',
                          left: 'result',
                          right: {
                            kind: 'JSExpression',
                            expression: 'body.data',
                          },
                        },
                      ],
                    },
                  },
                  requestDefinition: {
                    contentType: 'application/x-www-form-urlencoded',
                    body: [
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'form',
                        right: {
                          kind: 'JSExpression',
                          expression: '"is"',
                        },
                      },
                      {
                        kind: 'MapExpressionsDefinition',
                        left: 'o',
                        right: {
                          kind: 'JSExpression',
                          expression: '"k"',
                        },
                      },
                    ],
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
    });

    expect(result).toEqual({
      result: 12,
    });
  });

  it('should execute Eval definition with nested result', async () => {
    const interpreter = new MapInterpreter({ usecase: 'testCase' });
    const result = await interpreter.visit({
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
                      left: 'result.which.is.nested',
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
    });

    expect(result).toEqual({ result: { which: { is: { nested: 12 } } } });
  });
});
