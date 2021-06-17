export class Backoff {
  protected _current: number;

  constructor(
    protected readonly successor: (x: number) => number,
    protected readonly inverseSuccessor: (x: number) => number,
    initial: number
  ) {
    this._current = initial;
  }

  get current(): number {
    return this._current;
  }

  up(): number {
    this._current = this.successor(this._current);

    return this._current;
  }

  down(): number {
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

export class ExponentialBackoff extends Backoff {
  constructor(
    initial: number,
    exponent = 2.0,
    minimum?: number,
    maximum?: number
  ) {
    super(
      x => Backoff.clampValue(x * exponent, undefined, maximum),
      x => Backoff.clampValue(x / exponent, minimum, undefined),
      initial
    );
  }
}
