import { getLocal } from 'mockttp';

import { createUrl, HttpClient } from './http';

const mockServer = getLocal();

describe('HttpClient', () => {
  beforeEach(async () => {
    await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  it('gets basic response', async () => {
    await mockServer.get('/valid').thenJson(200, { response: 'valid' });
    const url = mockServer.urlFor('/valid');
    const response = await HttpClient.request(url, {
      method: 'get',
      accept: 'application/json',
    });
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual({ response: 'valid' });
  });

  it('gets error response', async () => {
    await mockServer
      .get('/invalid')
      .thenJson(404, { error: { message: 'Not found' } });
    const url = mockServer.urlFor('/invalid');
    const response = await HttpClient.request(url, {
      method: 'get',
      accept: 'application/json',
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

  it('should correctly interpolate multiple parameters', () => {
    const inputUrl =
      'https://example.com/test/{parameter.value}/another/{parameter.another}';

    const url = createUrl(inputUrl, {
      pathParameters: { parameter: { value: 'hello', another: 'goodbye' } },
    });

    expect(url).toEqual('https://example.com/test/hello/another/goodbye');
  });

  it('should correctly preserve trailing slash', () => {
    const baseUrl = 'http://example.com/';
    const inputUrl = '/test/';

    expect(createUrl(baseUrl)).toEqual('http://example.com/');
    expect(createUrl(inputUrl, { baseUrl })).toEqual(
      'http://example.com/test/'
    );
  });
});
