import { Sandbox } from "./Sandbox";

describe("sandbox", () => {
  let sandbox!: Sandbox;

  beforeEach(() => {
    process.env.SECRET = "MuchSecret";
    sandbox = new Sandbox();
  });

  it("prevents string masking attackt", () => {
    const js = `   
    // Let x be any value not in
    // (null, undefined, Object.create(null)).
    var x = {},
      // If the attacker can control three strings
      a = "constructor",
      b = "constructor",
      s = "process.env.SECRET = 'overwrite'";
    // and trick code into doing two property lookups
    // they control, a call with a string they control,
    // and one more call with any argument
    x[a][b](s)();
    // then they can cause any side-effect achievable
    // solely via objects reachable from the global scope.
    // This includes full access to any exported module APIs,
    // all declarations in the current module, and access
    // to builtin modules like child_process, fs, and net.
    `;

    expect(() => sandbox.evalJS(js)).toThrowError();
    expect(process.env.SECRET).toEqual("MuchSecret");
  });

  it("prevents primodial types pollution", () => {
    const js = `
    Array.prototype.toString = () => {
      console.log("I have been called!!!!");
      return "Modified!!!!";
    };`;
    sandbox.evalJS(js);
    expect([1, 2, 3].toString()).toEqual("1,2,3");
  });

  it("prevents quitting the process", () => {
    const js = `process.exit();`;
    expect(() => sandbox.evalJS(js)).toThrowError();
  });

  describe("Halting problem (Stalling the event loop)", () => {
    it("while(true)", () => {
      expect(() => sandbox.evalJS(`while(true){1+1}`)).toThrowError(/Script execution timed out/);

    });

    it("prevents using async", () => {
      expect(() => sandbox.evalJS(`new Promise.resolve(5)`)).toThrowError(/Promise/);
    });
  });
});
