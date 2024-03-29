export class Backoff {
  public static DEFAULT_INITIAL = 500;

  protected _current: number;

  constructor(
    protected readonly successor: (x: number) => number,
    protected readonly inverseSuccessor: (x: number) => number,
    initial: number
  ) {
    this._current = initial;
  }

  public get current(): number {
    return this._current;
  }

  public up(): number {
    this._current = this.successor(this._current);

    return this._current;
  }

  public down(): number {
    this._current = this.inverseSuccessor(this._current);

    return this._current;
  }

  protected static clampValue(
    value: number,
    minimum?: number,
    maximum?: number
  ): number {
    if (minimum !== undefined) {
      value = Math.max(minimum, value);
    }
    if (maximum !== undefined) {
      value = Math.min(maximum, value);
    }

    return value;
  }
}

export class ConstantBackoff extends Backoff {
  constructor(initial: number) {
    super(
      x => x,
      x => x,
      initial
    );
  }
}

export class LinearBackoff extends Backoff {
  constructor(
    initial: number,
    step: number,
    minimum?: number,
    maximum?: number
  ) {
    super(
      x => Backoff.clampValue(x + step, undefined, maximum),
      x => Backoff.clampValue(x - step, minimum, undefined),
      initial
    );
  }
}

export class ExponentialBackoff extends Backoff {
  public static DEFAULT_BASE = 2;

  constructor(
    initial: number,
    base: number,
    minimum?: number,
    maximum?: number
  ) {
    super(
      x => Backoff.clampValue(x * base, undefined, maximum),
      x => Backoff.clampValue(x / base, minimum, undefined),
      initial
    );
  }
}
