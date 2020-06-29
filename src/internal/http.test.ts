import {
  createServer,
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'http';

import { HttpClient } from './http';

const port = Math.floor(Math.random() * 64511 + 1024);

const listener: RequestListener = (
  req: IncomingMessage,
  res: ServerResponse
) => {
  switch (`${req.method} ${req.url}`) {
    case 'GET /valid':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ response: 'valid' }));
      break;

    case 'GET /invalid':
      res.writeHead(404);
      res.write(JSON.stringify({ error: { message: 'Not found' } }));
      break;

    default:
      throw new Error(
        `Invalid combination of url and method: ${req.url}, ${req.method}`
      );
  }
  res.end();
};

const server = createServer(listener);

describe('HttpClient', () => {
  beforeAll(() => {
    server.listen(port);
  });

  afterAll(() => {
    server.close();
  });

  it('gets basic response', async () => {
    const response = await HttpClient.request(
      `http://localhost:${port}/valid`,
      { method: 'get' }
    );
    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual({ response: 'valid' });
  });

  it('gets error response', async () => {
    const response = await HttpClient.request(
      `http://localhost:${port}/invalid`,
      { method: 'get' }
    );
    expect(response.statusCode).toEqual(404);
    expect(response.body).toEqual({ error: { message: 'Not found' } });
  });
});
