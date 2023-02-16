import { Config } from '../../core';
import { getStdlib } from '../../core/interpreter/sandbox';
import type { ISandbox } from '../../interfaces/sandbox';
import { NodeFileSystem } from '../filesystem';
import { NodeSandbox } from './sandbox.node';

const config = new Config(NodeFileSystem);

describe('sandbox', () => {
  let sandbox: ISandbox;

  beforeEach(() => {
    sandbox = new NodeSandbox();
  });

  it('prevents string masking attack', () => {
    process.env.SECRET = 'MuchSecret';

    const js = `
    (() => {
      // Let x be any value not in
      // (null, undefined, Object.create(null)).
      var x = {};

      // If the attacker can control three strings
      var a = "constructor";
      var b = "constructor";
      var s = "process.env.SECRET = 'overwrite'";

      // and trick code into doing two property lookups
      // they control, a call with a string they control,
      // and one more call with any argument
      x[a][b](s)();

      // then they can cause any side-effect achievable
      // solely via objects reachable from the global scope.
      // This includes full access to any exported module APIs,
      // all declarations in the current module, and access
      // to builtin modules like child_process, fs, and net.
    })()
    `;

    expect(() => sandbox.evalScript(config, js)).toThrow(
      'Code generation from strings disallowed for this context'
    );
    expect(() =>
      sandbox.evalScript(
        config,
        '(() => {}).constructor("process.env.SECRET = \'overwrite\'")()'
      )
    ).toThrow('Code generation from strings disallowed for this context');

    expect(process.env.SECRET).toEqual('MuchSecret');
  });

  it('prevents primodial types pollution', () => {
    const js = `
    Array.prototype.toString = () => {
      console.log("I have been called!!!!");
      return "Modified!1!!!1!";
    };`;
    sandbox.evalScript(config, js);
    expect([1, 2, 3].toString()).toEqual('1,2,3');
  });

  it('no io', async () => {
    expect(() =>
      sandbox.evalScript(config, '1; import fs; fs.readFileSync("secrets")')
    ).toThrow(
      /('import' and 'export' may appear only with 'sourceType: module')/
    );

    expect(() => sandbox.evalScript(config, 'console.log')).toThrow(
      'console is not defined'
    );

    expect(() => sandbox.evalScript(config, 'process.exit(1)')).toThrow(
      'process is not defined'
    );
  });

  it('Halting problem (Stalling the event loop)', () => {
    expect(() =>
      sandbox.evalScript(config, '(() => { while(true) { 1 + 1 } })()')
    ).toThrow('Script execution timed out');
  });

  it('no Promises or async', () => {
    expect(() =>
      sandbox.evalScript(config, 'Promise.resolve().then(x => 1)')
    ).toThrow('Async not available');

    expect(() => sandbox.evalScript(config, 'new Promise.resolve(5)')).toThrow(
      'Promise.resolve is not a constructor'
    );

    expect(() => sandbox.evalScript(config, 'async () => 1')).toThrow();
  });

  it('no eval or Function constructor', () => {
    expect(() => sandbox.evalScript(config, 'eval("1")')).toThrow(
      'eval is not defined'
    );

    expect(() =>
      sandbox.evalScript(
        config,
        'Function.call(undefined, "return 1").call(undefined)'
      )
    ).toThrow('Function is not defined');

    expect(() =>
      sandbox.evalScript(
        config,
        '(() => {}).constructor.call(undefined, "return 1").call(undefined)'
      )
    ).toThrow('Code generation from strings disallowed for this context');
  });

  it('isolation', () => {
    expect(
      sandbox.evalScript(config, 'global["prop"] = 0; global["prop"]')
    ).toStrictEqual(0);

    expect(sandbox.evalScript(config, 'global["prop"]')).not.toBeDefined();
  });

  it('correctly evaluates object literal', () => {
    expect(sandbox.evalScript(config, '{ foo: 1, bar: 2 }')).toStrictEqual({
      foo: 1,
      bar: 2,
    });
  });

  it('correctly evaluates array literal', () => {
    const v = sandbox.evalScript(config, '[1, 2, 3]');
    expect(v).toStrictEqual([1, 2, 3]);
    expect(Array.isArray(v)).toBe(true);
  });

  it('correctly evaluates array literal inside object literal', () => {
    const v = sandbox.evalScript(
      config,
      '{ a: 1, b: [1, 2, 3, { x: Buffer.from("hello"), y: [1, 2, 3] }] }'
    );
    expect(v).toStrictEqual({
      a: 1,
      b: [1, 2, 3, { x: Buffer.from('hello'), y: [1, 2, 3] }],
    });
    expect(Array.isArray((v as { b: unknown }).b)).toBe(true);
  });

  it('correctly works with line comment', () => {
    expect(
      sandbox.evalScript(config, '34; // this is number 34')
    ).toStrictEqual(34);
  });

  it('errors with unclosed block comment', () => {
    expect(() =>
      sandbox.evalScript(config, '34; /* this is number 34')
    ).toThrow('Invalid or unexpected token');
  });

  it('correctly works without semicolon', () => {
    expect(sandbox.evalScript(config, '34')).toStrictEqual(34);
  });

  describe('stdlib', () => {
    it('uses unstable stdlib if passed', () => {
      expect(
        sandbox.evalScript(
          config,
          'std.unstable.time.isoDateToUnixTimestamp("2022-01-01T00:11:00.123Z")',
          getStdlib()
        )
      ).toStrictEqual(1640995860123);

      expect(
        sandbox.evalScript(
          config,
          '(std.unstable.debug.log(1123), std.unstable.time.unixTimestampToIsoDate(1640995860123))',
          getStdlib()
        )
      ).toStrictEqual('2022-01-01T00:11:00.123Z');
    });
  });
});
