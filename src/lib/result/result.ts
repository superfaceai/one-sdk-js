export class Ok<T, E> {
  constructor(readonly value: T) {}

  isOK(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return !this.isOK();
  }

  map<A>(f: (t: T) => A): Result<A, E> {
    return new Ok(f(this.value));
  }

  mapErr<U>(_: (e: E) => U): Result<T, U> {
    return new Ok(this.value);
  }

  async andThen<U>(f: (t: T) => Promise<U>): Promise<Result<U, E>> {
    const newInner = await f(this.value);

    return new Ok(newInner);
  }

  match<A>(ok: (t: T) => A, _err: (e: E) => A): A {
    return ok(this.value);
  }
}

export class Err<T, E> {
  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return !this.isOk();
  }

  map<A>(_f: (t: T) => A): Result<A, E> {
    return new Err(this.error);
  }

  mapErr<U>(f: (e: E) => U): Result<T, U> {
    return new Err(f(this.error));
  }

  andThen<U>(_f: (t: T) => Result<U, E>): Result<U, E> {
    return new Err(this.error);
  }

  asyncMap<U>(_f: (t: T) => Promise<U>): Promise<Result<U, E>> {
    return Promise.resolve(new Err(this.error));
  }

  match<A>(_ok: (t: T) => A, err: (e: E) => A): A {
    return err(this.error);
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;
export const ok = <T, E>(value: T): Ok<T, E> => new Ok(value);
export const err = <T, E>(err: E): Err<T, E> => new Err(err);
