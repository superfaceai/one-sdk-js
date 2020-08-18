import { getLocal } from 'mockttp';

import { HttpClient } from './http';

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
});
