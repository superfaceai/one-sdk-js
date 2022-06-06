// This interface exists as a guideline of what to implement on both result variants and as a place where documentation can be attached.
interface IResult<T, E> {
  /** Returns `true` if this result represents an `Ok variant. */
  isOk(): this is Ok<T, E>;

  /** Returns `true` if this result represents an `Err` variant. */
  isErr(): this is Err<T, E>;

  /** Maps `Ok` variant and propagates `Err` variant. */
  map<U>(f: (t: T) => U): Result<U, E>;

  /** Maps `Err` variant and propagates `Ok` variant. */
  mapErr<U>(f: (e: E) => U): Result<T, U>;

  /** Fallibly maps `Ok` variant and propagates `Err` variant. */
  andThen<U>(f: (t: T) => Result<U, E>): Result<U, E>;

  /** Calls `ok` if `this` is `Ok` variant and `err` if `this` is `Err` variant. */
  match<U>(ok: (t: T) => U, err: (e: E) => U): U;

  /** Unwraps `Ok` variant and throws on `Err` variant. */
  unwrap(): T;
}

interface IAsyncResult<T, E> {
  /** Maps `Ok` variant asynchronously and propagates `Err` variant. */
  mapAsync<U>(f: (t: T) => Promise<U>): Promise<Result<U, E>>;

  /** Maps `Err` variant asynchronously and propagates `Ok` variant. */
  mapErrAsync<U>(f: (t: E) => Promise<U>): Promise<Result<T, U>>;

  /** Fallibly maps `Ok` variant asynchronously and propagates `Err` variant. */
  andThenAsync<U>(f: (t: T) => Promise<Result<U, E>>): Promise<Result<U, E>>;
}

export class Ok<T, E> implements IResult<T, E>, IAsyncResult<T, E> {
  constructor(public readonly value: T) {}

  public isOk(): this is Ok<T, E> {
    return true;
  }

  public isErr(): this is Err<T, E> {
    return !this.isOk();
  }

  public map<U>(f: (t: T) => U): Result<U, E> {
    return ok(f(this.value));
  }

  public mapErr<U>(_: (e: E) => U): Result<T, U> {
    return ok(this.value);
  }

  public andThen<U>(f: (t: T) => Result<U, E>): Result<U, E> {
    return f(this.value);
  }

  public match<U>(ok: (t: T) => U, _: (e: E) => U): U {
    return ok(this.value);
  }

  public unwrap(): T {
    return this.value;
  }

  public async mapAsync<U>(f: (t: T) => Promise<U>): Promise<Result<U, E>> {
    const inner = await f(this.value);

    return ok(inner);
  }

  public async mapErrAsync<U>(_: (t: E) => Promise<U>): Promise<Result<T, U>> {
    return ok(this.value);
  }

  public async andThenAsync<U>(
    f: (t: T) => Promise<Result<U, E>>
  ): Promise<Result<U, E>> {
    return f(this.value);
  }
}

export class Err<T, E> implements IResult<T, E>, IAsyncResult<T, E> {
  constructor(public readonly error: E) {}

  public isOk(): this is Ok<T, E> {
    return false;
  }

  public isErr(): this is Err<T, E> {
    return !this.isOk();
  }

  public map<U>(_: (t: T) => U): Result<U, E> {
    return err(this.error);
  }

  public mapErr<U>(f: (e: E) => U): Result<T, U> {
    return err(f(this.error));
  }

  public andThen<U>(_: (t: T) => Result<U, E>): Result<U, E> {
    return err(this.error);
  }

  public match<U>(_: (t: T) => U, err: (e: E) => U): U {
    return err(this.error);
  }

  public unwrap(): T {
    throw this.error;
  }

  public async mapAsync<U>(_: (t: T) => Promise<U>): Promise<Result<U, E>> {
    return err(this.error);
  }

  public async mapErrAsync<U>(f: (t: E) => Promise<U>): Promise<Result<T, U>> {
    const inner = await f(this.error);

    return err(inner);
  }

  public async andThenAsync<U>(
    _: (t: T) => Promise<Result<U, E>>
  ): Promise<Result<U, E>> {
    return err(this.error);
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;
export const ok = <T, E>(value: T): Ok<T, E> => new Ok(value);
export const err = <T, E>(err: E): Err<T, E> => new Err(err);
