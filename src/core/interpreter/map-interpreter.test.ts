import { ApiKeyPlacement, HttpScheme, SecurityType } from '@superfaceai/ast';
import { parseMap, Source } from '@superfaceai/parser';
import { getLocal } from 'mockttp';

import { MockTimers } from '../../mock';
import { CrossFetch, NodeCrypto, NodeFileSystem } from '../../node';
import { Config } from '../config';
import { ServiceSelector } from '../services';
import { MapInterpreter } from './map-interpreter';

const mockServer = getLocal();
const timers = new MockTimers();
const fetchInstance = new CrossFetch(timers);
const config = new Config(NodeFileSystem);
const crypto = new NodeCrypto();

const parseMapFromSource = (source: string) =>
  parseMap(
    new Source(
      `
      profile = "example@0.0"
      provider = "example"
      ` + source
    )
  );

describe('MapInterpreter', () => {
  let mockServicesSelector: ServiceSelector;

  beforeEach(async () => {
    await mockServer.start();
    mockServicesSelector = ServiceSelector.withDefaultUrl(mockServer.url);
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('should execute minimal Eval definition', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        map result 1 + 2
      }
    `);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(3);
  });

  it('should execute Eval definition with variables', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map Test {
        x = 5
        map result x + 7
      }
    `);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should execute eval definition with jessie array', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map Test {
        map result [1, 2, 3]
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual([1, 2, 3]);
  });

  it('should inline call predefined operation', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      operation TestOp {
        return args.foo
      }

      map Test {
        result = call TestOp(foo = 12)
        map result result
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call predefined operation', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      operation TestOp {
        return args.hey.now.length
      }

      map Test {
        call TestOp(hey.now = "you are a rock star") {
          map result outcome.data + 7
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(26);
  });

  it('should correctly resolve scope', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      operation TestOp {
        x = 7
        return x + 5
      }

      map Test {
        x = 8
        result = call TestOp()
        map result result
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API', async () => {
    const url = '/twelve';
    await mockServer.get(url).thenJson(
      200,
      { data: 12 },
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Language': 'en-US, en-CA',
      }
    );
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
          request {
            headers {
              "content-type" = "application/json"
            }
          }

          response 200 "application/json" "en-US" {
            map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with path parameters', async () => {
    const url = '/twelve';
    await mockServer.get(url + '/2').thenJson(200, { data: 144 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        input: { page: '2' },
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map Test {
        page = input.page
        http GET "${url}/{page}" {
          request {
            headers {
              "content-type" = "application/json"
            }
          }

          response 200 "application/json" "en-US" {
            map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(144);
  });

  it('should correctly trim and parse path parameters in http call', async () => {
    const url = '/thirteen';
    await mockServer.get(url + '/2/get/now').thenJson(200, { data: 169 });

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        input: { page: '2', cmd: 'get', when: 'now' },
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map Test {
        page = input.page
        http GET "${url}/{ page     	  }/{input.cmd }/{ input.when}" {
          request {
            headers {
              "content-type" = "application/json"
            }
          }

          response 200 "application/json" "en-US" {
            map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    result.unwrap();
    expect(result.isOk() && result.value).toEqual(169);
  });

  it('should call an API with parameters', async () => {
    const url = '/twelve';
    await mockServer
      .get(url)
      .withQuery({ page: 2 })
      .thenJson(200, { data: 144 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        input: { page: 2 },
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map Test {
        http GET "${url}" {
          request {
            query {
              page = input.page
            }
            headers {
              "content-type" = "application/json"
            }
          }

          response 200 "application/json" "en-US" {
            map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(144);
  });

  it('should call an API with parameters and POST request', async () => {
    const url = '/checkBody';
    await mockServer
      .post(url)
      .withJsonBody({ anArray: [1, 2, 3] })
      .withHeaders({ someheader: 'hello' })
      .thenJson(201, { bodyOk: true, headerOk: true });
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
        http POST "${url}" {
          request {
            headers {
              someheader = "hello"
            }
            body {
              anArray = [1, 2, 3]
            }
          }

          response 201 {
            map result body
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({
      headerOk: true,
      bodyOk: true,
    });
  });

  it('should run multi step operation', async () => {
    const url1 = '/first';
    const url2 = '/second';
    await mockServer.get(url1).thenJson(200, { firstStep: { someVar: 12 } });
    await mockServer.get(url2).thenJson(200, { secondStep: 5 });
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
        http GET "${url1}" {
          request "application/json" {
          }

          response 200 "application/json" {
            someVariable = body.firstStep.someVar
          }
        }

        http GET "${url2}" {
          response 200 "application/json" {
            someOtherVariable = body.secondStep
          }
        }

        return map result someVariable * someOtherVariable
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12 * 5);
  });

  it('should call an API with Basic auth', async () => {
    const url = '/basic';
    await mockServer
      .get(url)
      .withHeaders({ Authorization: 'Basic bmFtZTpwYXNzd29yZA==' })
      .thenJson(200, { data: 12 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [
          {
            id: 'my_basic',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
            username: 'name',
            password: 'password',
          },
        ],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        http GET "${url}" {
          security "my_basic"

          response 200 {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Bearer auth', async () => {
    const url = '/bearer';
    await mockServer
      .get(url)
      .withHeaders({ Authorization: 'Bearer SuperSecret' })
      .thenJson(200, { data: 12 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [
          {
            id: 'my_bearer',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
            token: 'SuperSecret',
          },
        ],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        http GET "${url}" {
          security "my_bearer"

          response 200 {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Apikey auth in header', async () => {
    const url = '/apikey';
    await mockServer
      .get(url)
      .withHeaders({ Key: 'SuperSecret' })
      .thenJson(200, { data: 12 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [
          {
            id: 'my_apikey',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'Key',
            apikey: 'SuperSecret',
          },
        ],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        http GET "${url}" {
          security "my_apikey"

          response 200 {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    result.unwrap();
    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with Apikey auth in query', async () => {
    const url = '/apikey';
    await mockServer
      .get(url)
      .withQuery({ key: 'SuperSecret' })
      .thenJson(200, { data: 12 });
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [
          {
            id: 'my_apikey',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.QUERY,
            name: 'key',
            apikey: 'SuperSecret',
          },
        ],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        http GET "${url}" {
          security "my_apikey"

          response 200 {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with multipart/form-data body', async () => {
    const url = '/formdata';
    await mockServer.post(url).thenCallback(async request => {
      const text = await request.body.getText();
      if (
        text !== undefined &&
        text.includes('formData') &&
        text.includes('myFormData') &&
        text.includes('is') &&
        text.includes('present')
      ) {
        return {
          json: { data: 12 },
          status: 201,
        };
      }

      return { json: { failed: true }, statusCode: 400 };
    });
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
        http POST "${url}" {
          request "multipart/form-data" {
            body {
              formData = "myFormData"
              is = "present"
            }
          }

          response 201 "application/json" {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should call an API with application/x-www-form-urlencoded', async () => {
    const url = '/urlencoded';
    await mockServer
      .post(url)
      .withForm({ form: 'is', o: 'k' })
      .thenJson(201, { data: 12 });
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
        http POST "${url}" {
          request "application/x-www-form-urlencoded" {
            body {
              form = "is"
              o = "k"
            }
          }

          response 201 "application/json" "en-US" {
            return map result body.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(12);
  });

  it('should execute Eval definition with nested result', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'testCase',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const ast = parseMapFromSource(`
      map testCase {
        set {
          result.which.is.nested = 12
          result.which.is.also.nested = 13
        }

        map result result
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({
      which: { is: { nested: 12, also: { nested: 13 } } },
    });
  });

  it('should execute based on condition', async () => {
    const ast = parseMapFromSource(`
      map Test {
        map result if (input.condition) 7
        map result if (!input.condition) 8
      }`);
    const interpreter1 = new MapInterpreter(
      {
        usecase: 'Test',
        input: { condition: true },
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const interpreter2 = new MapInterpreter(
      {
        usecase: 'Test',
        input: { condition: false },
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result1 = await interpreter1.perform(ast);
    const result2 = await interpreter2.perform(ast);
    expect(result1.isOk() && result1.value).toEqual(7);
    expect(result2.isOk() && result2.value).toEqual(8);
  });

  it('should correctly construct result object', async () => {
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(
      parseMapFromSource(`
        map Test {
          return map result {
            test.x = 1
            test.y = 2
          }
        }`)
    );
    expect(result.isOk() && result.value).toEqual({ test: { x: 1, y: 2 } });
  });

  it('should correctly return from operation', async () => {
    const url = '/test';
    await mockServer.get(url).thenJson(200, {});
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
        call TestOp() {
          map result {
            outcome = outcome.data
          }
        }
      }

      operation TestOp {
        http GET "${url}" {
          response 200 "application/json" {
            return {
              message = "worked!"
            }
          }
        }
      } `);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({
      outcome: { message: 'worked!' },
    });
  });

  it('should correctly resolve scopes in call block', async () => {
    const ast = parseMapFromSource(`
      map test {
        someVariable = null
        call foo() {
          someVariable = 42
        }
        map result {
          answer = someVariable
        }
      }

      operation foo {
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ answer: 42 });
  });

  it('should perform operations with correct scoping', async () => {
    const url = '/test';
    await mockServer.get(url).thenJson(200, {});
    const ast = parseMapFromSource(`
      map Test {
        fooResult = call foo()
        barResult = call bar()
        map result {
          f = fooResult
          b = barResult
        }
      }

      operation foo {
        http GET "${url}" {
          response 200 "application/json" {
            return {
              a = 41
            }
          }
        }
      }

      operation bar {
        http GET "${url}" {
          response 200 "application/json" {
            return {
              b = 42
            }
          }
        }
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({
      f: { a: 41 },
      b: { b: 42 },
    });
  });

  it('should correctly resolve args', async () => {
    const ast = parseMapFromSource(`
      map test {
        someVariable = 42
        call foo(a1 = someVariable) {
          map result {
            answer = outcome.data
          }
        }
      }

      operation foo {
        return {
          a = args.a1
        }
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ answer: { a: 42 } });
  });

  it('should properly resolve nested calls', async () => {
    const ast = parseMapFromSource(`
      map Test {
        map result {
          x = call foo()
        }
      }

      operation foo {
        bar = call bar()
        return bar + 1
      }

      operation bar {
        return 41
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ x: 42 });
  });

  it('should perform an iteration', async () => {
    const ast = parseMapFromSource(`
      map Test {
        letters = ['x', 'y', 'z']
        results = []
        call foreach (letter of letters.reverse()) TestOp(letter = letter) {
          results = results.concat(outcome.data)
        }
        map result {
          results = results
        }
      }

      operation TestOp {
        return args.letter.toUpperCase()
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ results: ['Z', 'Y', 'X'] });
  });

  it('should break from iteration', async () => {
    const ast = parseMapFromSource(`
      map Test {
        letters = ['x', 'y', 'z']
        results = []
        call foreach(letter of letters.reverse()) TestOp(letter = letter) {
          results = results.concat(outcome.data)

          return map result { results = results }
        }
      }
      operation TestOp {
        return args.letter.toUpperCase()
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ results: ['Z'] });
  });

  it('should perform an inline iterating call', async () => {
    const ast = parseMapFromSource(`
      map Test {
        letters = ['x', 'y', 'z']
        results = call foreach (letter of letters.reverse()) TestOp(letter = letter)
        map result {
          results = results
        }
      }

      operation TestOp {
        return args.letter.toUpperCase()
      }
    `);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ results: ['Z', 'Y', 'X'] });
  });

  it('should perform an iteration with condition', async () => {
    const ast = parseMapFromSource(`
      map Test {
        letters = ['x', 'y', 'z']
        results = []
        call foreach (letter of letters.reverse()) TestOp(letter = letter) if (letter === 'x') {
          results = results.concat(outcome.data)
        }
        map result {
          results = results
        }
      }

      operation TestOp {
        return args.letter.toUpperCase()
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ results: ['X'] });
  });

  it('should perform an inline iterating call with condition', async () => {
    const ast = parseMapFromSource(`
      map Test {
        numbers = [1, 2, 3]
        results = call foreach (number of numbers) TestOp(number = number) if (number % 2 !== 0)
        map result {
          results = results
        }
      }

      operation TestOp {
        return args.number * 2
      }`);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ results: [2, 6] });
  });

  it('should be able to use input in path parameters', async () => {
    const url = '/twelve';
    await mockServer.get(url).thenJson(200, { data: 12 });
    const ast = parseMapFromSource(`
      map Test {
        http GET "/{input.test}" {
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
        input: { test: 'twelve' },
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ result: 12 });
  });

  it('should strip trailing slash from baseUrl', async () => {
    await mockServer.get('/thirteen').thenJson(200, { data: 12 });
    const baseUrl = mockServer.urlFor('/thirteen').replace('thirteen', '');
    expect(baseUrl.split('')[baseUrl.length - 1]).toEqual('/');
    const ast = parseMapFromSource(`
      map Test {
        username = input.user
        http GET "/thirteen" {
          response 200 "application/json" {
            map result {
              result = 13
            }
          }
        }
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(baseUrl),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual({ result: 13 });
  });

  it('should make response headers accessible', async () => {
    const url = '/twelve';
    await mockServer.get(url).thenJson(
      200,
      {},
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Language': 'en-US, en-CA',
        Data: '12',
      }
    );
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
          request {
            headers {
              "content-type" = "application/json"
            }
          }

          response 200 "application/json" "en-US" {
            map result headers.data
          }
        }
      }`);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual('12');
  });

  it('should use integration parameters in jessie', async () => {
    const ast = parseMapFromSource(`
      map Test {
        map result parameters.message
      }
    `);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: mockServicesSelector,
        parameters: {
          message: 'nice!',
        },
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual('nice!');
  });

  it('should use integration parameters in URL', async () => {
    const url = '/twelve';
    await mockServer.get(url).thenJson(200, { data: 12 });
    const ast = parseMapFromSource(`
      map Test {
        http GET "/{parameters.path}" {
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
        parameters: { path: 'twelve' },
        security: [],
        services: mockServicesSelector,
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ result: 12 });
  });

  it('should use integration parameters in baseUrl', async () => {
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
        parameters: { path: 'twelve' },
        security: [],
        services: ServiceSelector.withDefaultUrl(
          `${mockServicesSelector.getUrl()!}/{path}`
        ),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ result: 12 });
  });

  it('should correctly select service', async () => {
    const urlOne = '/one/something';
    await mockServer.get(urlOne).thenJson(200, { data: 1 });

    const urlTwo = '/two/something';
    await mockServer.get(urlTwo).thenJson(200, { data: 2 });

    const urlThree = '/three/something';
    await mockServer.get(urlThree).thenJson(200, { data: 3 });

    const ast = parseMapFromSource(`
      map Test {
        value = 0

        http GET default "/something" {
          response 200 "application/json" {
            value = value + body.data
          }
        }

        http GET "two" "/something" {
          response 200 "application/json" {
            value = value + body.data
          }
        }

        http GET "three" "/something" {
          response 200 "application/json" {
            value = value + body.data
          }
        }

        map result {
          result = value
        }
      }`);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: new ServiceSelector(
          [
            { id: 'one', baseUrl: `${mockServicesSelector.getUrl()!}/one` },
            { id: 'two', baseUrl: `${mockServicesSelector.getUrl()!}/two` },
            { id: 'three', baseUrl: `${mockServicesSelector.getUrl()!}/three` },
          ],
          'one'
        ),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual({ result: 6 });
  });

  it('should correctly return error from operation', async () => {
    const ast = parseMapFromSource(`
      map Test {
        call TestOp(letter = "y") {
          return map result outcome.error
        }
      }
      operation TestOp {
        fail args.letter.toUpperCase()
      }
      `);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual('Y');
  });

  it('scope does not leak into callee', async () => {
    const ast = parseMapFromSource(`
      map Test {
        notVisible = 15
        call Foo() {
          map result outcome.data
        }
      }

      operation Foo {
        return notVisible
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isErr()).toEqual(true);
  });

  it('should not overwrite outcome.data from current scope', async () => {
    const ast = parseMapFromSource(`
    map Test {
      result = 5
      res = 1

      call Foo() {
        res = outcome.data
      }

      map result res
    }
    operation Foo {
      return 10
    }
    `);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual(10);
  });

  it('should not leak result from called operation', async () => {
    const ast = parseMapFromSource(`
      map Test {
        a = 1
        call Foo() {
          b = 2
        }
        c = outcome.data

        // intentionally no map result
        // a should equal 1
        // b should equal 2
        // c should equal 3
        // result should be the default value
      }
      operation Foo {
        result = "hello"
        return 3
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual(undefined);
  });

  it('should not overwrite result after operation call', async () => {
    const ast = parseMapFromSource(`
      map Test {
        map result 15
        foo = call Foo()

        map result 15
        call Foo() {}
      }

      operation Foo {
        return 3
      }`);
    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
      },
      { fetchInstance, config, crypto }
    );
    const result = await interpreter.perform(ast);
    expect(result.isOk() && result.value).toEqual(15);
  });

  it('should preserve buffer types with foreach', async () => {
    const ast = parseMapFromSource(`    
    map Test {
      mappedItems = call foreach(item of input.items) mapItem(item = item)
    
      map result {
        items: mappedItems
      }
    }
    
    operation mapItem {
        return args.item
    }`);

    const buffer = Buffer.from('hello');
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
        input: {
          items: [{ buffer }, { buffer }],
        },
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);
    expect(result.isOk()).toBe(true);
    const items = (result.unwrap() as any).items;

    expect(Buffer.isBuffer(items[0].buffer)).toBe(true);
    expect(Buffer.isBuffer(items[1].buffer)).toBe(true);
  });

  it('should not leak optional properties in foreach', async () => {
    const ast = parseMapFromSource(`    
    map Test {
      mappedItems = call foreach(item of input.items) mapItem(item = item)
    
      map result {
        items: mappedItems
      }
    }
    
    operation mapItem {
        return args.item
    }`);

    const interpreter = new MapInterpreter(
      {
        usecase: 'Test',
        security: [],
        services: ServiceSelector.withDefaultUrl(''),
        input: {
          items: [{ a: 1, b: 2 }, { a: 3 }],
        },
      },
      { fetchInstance, config, crypto }
    );

    const result = await interpreter.perform(ast);
    expect(result.isOk()).toBe(true);
    const items = (result.unwrap() as any).items;

    expect(items).toStrictEqual([{ a: 1, b: 2 }, { a: 3 }]);
  });
});
