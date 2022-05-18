import { getLocal } from 'mockttp';

import { CrossFetch } from '../../../lib/fetch';
import { Primitive } from '../variables';
import { createUrl, HttpClient } from './http';

const mockServer = getLocal();
const fetchInstance = new CrossFetch();
const http = new HttpClient(fetchInstance);

describe('HttpClient', () => {
  let baseUrl: string;

  beforeEach(async () => {
    await mockServer.start();
    baseUrl = mockServer.url;
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('gets basic response', async () => {
    await mockServer.get('/valid').thenJson(200, { response: 'valid' });
    const response = await http.request('/valid', {
      method: 'get',
      accept: 'application/json',
      baseUrl,
    });
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual({ response: 'valid' });
  });

  it('gets error response', async () => {
    await mockServer
      .get('/invalid')
      .thenJson(404, { error: { message: 'Not found' } });
    const response = await http.request('/invalid', {
      method: 'get',
      accept: 'application/json',
      baseUrl,
    });
    expect(response.statusCode).toEqual(404);
    expect(response.body).toEqual({ error: { message: 'Not found' } });
  });

  it('should correctly interpolate parameters with baseUrl', () => {
    const baseUrl = 'https://example.com/';
    const inputUrl = '/test/{parameter.value}';

    const url = createUrl(inputUrl, {
      baseUrl,
      pathParameters: { parameter: { value: 'hello' } },
    });

    expect(url).toEqual('https://example.com/test/hello');
  });

  it('should correctly interpolate parameters with whitespaces in interpolation key', () => {
    const baseUrl = 'https://example.com/';
    const inputUrl = '/test/{ parameter.value   }';

    const url = createUrl(inputUrl, {
      baseUrl,
      pathParameters: { parameter: { value: 'hello' } },
    });

    expect(url).toEqual('https://example.com/test/hello');
  });

  it('should correctly interpolate multiple parameters', () => {
    const inputUrl = '/test/{parameter.value}/another/{parameter.another}';

    const url = createUrl(inputUrl, {
      pathParameters: { parameter: { value: 'hello', another: 'goodbye' } },
      baseUrl: 'https://example.com',
    });

    expect(url).toEqual('https://example.com/test/hello/another/goodbye');
  });

  it('should correctly preserve trailing slash', () => {
    const baseUrl = 'http://example.com/';
    const inputUrl = '/test/';

    expect(createUrl('', { baseUrl })).toEqual('http://example.com/');
    expect(createUrl(inputUrl, { baseUrl })).toEqual(
      'http://example.com/test/'
    );
  });

  it('should correctly interpolate integration parameters in baseUrl', () => {
    const baseUrl = 'https://example.com/{value}';
    const inputUrl = '/hello';

    const url = createUrl(inputUrl, {
      baseUrl,
      integrationParameters: {
        value: 'test',
      },
    });

    expect(url).toEqual('https://example.com/test/hello');
  });

  describe('when request contains binary content type', () => {
    const binaryContentTypes = [
      'application/octet-stream',
      'audio/mp3',
      'audio/wav',
      'audio/wav;rate=8000',
      'video/mp4',
      'image/jpeg',
    ];
    let httpClient: HttpClient;
    let fetchMock: jest.Mock;

    for (const contentType of binaryContentTypes) {
      describe(`${contentType}`, () => {
        beforeEach(async () => {
          fetchMock = jest.fn().mockResolvedValue({
            status: 200,
            headers: [],
          });

          httpClient = new HttpClient({
            fetch: fetchMock,
          });

          await httpClient.request('/data', {
            method: 'post',
            accept: 'application/json',
            baseUrl: 'http://localhost',
            contentType: contentType,
            body: Buffer.from('data') as unknown as Primitive,
          });
        });

        it('should fetch request with binary body', async () => {
          const requestBody = fetchMock.mock.calls[0][1].body;
          expect(requestBody).toBeDefined();
          expect(requestBody._type).toBe('binary');
          expect(requestBody.data).toEqual(Buffer.from('data'));
        });

        it('should fetch request with correct Content-Type header', async () => {
          const requestHeaders = fetchMock.mock.calls[0][1].headers;
          expect(requestHeaders).toBeDefined();
          expect(requestHeaders['Content-Type']).toBe(contentType);
        });
      });
    }
  });

  describe('multipart/form-data', () => {
    it('encodes multipart boundary correctly', async () => {
      await mockServer.post('/data').thenCallback(async req => {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contentType: req.headers['content-type'],
            body: await req.body.getText(),
          }),
        };
      });

      const response = await http.request('/data', {
        method: 'post',
        contentType: 'multipart/form-data',
        body: {
          foo: 1,
          bar: 'baz',
        },
        baseUrl,
      });
      expect(response.statusCode).toBe(200);
      const body = response.body as any;
      expect(body.contentType).toMatch(/^multipart\/form-data;boundary=/);
    });
  });
});
