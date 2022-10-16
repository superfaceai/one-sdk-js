import { parseMap, Source } from '@superfaceai/parser';
import { getLocal } from 'mockttp';

import { MockTimers } from '../../mock';
import { NodeCrypto, NodeFetch, NodeFileSystem, NodeLogger } from '../../node';
import { Config } from '../config';
import { ServiceSelector } from '../services';
import { MapInterpreter2 } from './map-interpreter2';

const mockServer = getLocal();
const timers = new MockTimers();
const fetchInstance = new NodeFetch(timers);
const config = new Config(NodeFileSystem);
const crypto = new NodeCrypto();
const logger = new NodeLogger()

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

  it('should execute', async () => {
    await mockServer.forGet('/test').thenJson(200, { data: 0 });
    
    const interpreter = new MapInterpreter2(
      {
        usecase: 'SimpleMap',
        security: [],
        services: mockServicesSelector
      },
      { fetchInstance, config, crypto, logger }
    );
    const ast = parseMapFromSource(`
      map SimpleMap {
        x = 11

        http GET '/test' {
          response {
            y = x + body.value
            map result {
              value = call SimpleOperation(arg = y)
            }
          }
        }

        x = 0

        call foreach(x of A) Op(arg = x) if (x % 2 === 0) {
          // yield
          map result outcome.data
        }
      }

      operation SimpleOperation {
        v = true
        set if (args.arg === 11) {
          v = false
        }

        return v
      }
    `);
    const result = await interpreter.perform(ast);

    expect(result.isOk() && result.value).toEqual(true);
  });
});
