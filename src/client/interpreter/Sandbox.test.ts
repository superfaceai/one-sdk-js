import { evalScript } from './Sandbox';

describe('sandbox', () => {
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

    expect(() => evalScript(js)).toThrow(
      'Code generation from strings disallowed for this context'
    );
    expect(() =>
      evalScript(
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
    evalScript(js);
    expect([1, 2, 3].toString()).toEqual('1,2,3');
  });

  it('no io', () => {
    expect(() => evalScript('import fs; fs.readFileSync("secrets")')).toThrow(
      /(Cannot use import statement outside a module|Unexpected identifier)/
    );

    expect(() => evalScript('console.log')).toThrow('console is not defined');

    expect(() => evalScript('process.exit(1)')).toThrow(
      'process is not defined'
    );
  });

  it('Halting problem (Stalling the event loop)', () => {
    expect(() => evalScript('(() => { while(true) { 1 + 1 } })()')).toThrow(
      'Script execution timed out'
    );
  });

  it('no Promises or async', () => {
    expect(() => evalScript('Promise.reject().catch(() => {})')).toThrow(
      'Async not available'
    );

    expect(() => evalScript('new Promise.resolve(5)')).toThrow(
      'Promise.resolve is not a constructor'
    );

    expect(() => evalScript('async () => 1')).toThrow();
  });

  it('no eval or Function constructor', () => {
    expect(() => evalScript('eval("1")')).toThrow('eval is not defined');

    expect(() =>
      evalScript('Function.call(undefined, "return 1").call(undefined)')
    ).toThrow('Function is not defined');

    expect(() =>
      evalScript(
        '(() => {}).constructor.call(undefined, "return 1").call(undefined)'
      )
    ).toThrow('Code generation from strings disallowed for this context');
  });

  it('isolation', () => {
    expect(evalScript('global["prop"] = 0; global["prop"]')).toStrictEqual(0);

    expect(evalScript('global["prop"]')).not.toBeDefined();
  });

  it('correctly evaluates object literal', () => {
    expect(evalScript('{ foo: 1, bar: 2 }')).toStrictEqual({
      foo: 1,
      bar: 2,
    });
  });
});
