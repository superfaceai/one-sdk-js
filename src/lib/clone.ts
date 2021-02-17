/**
 * Creates a deep clone of the value.
 */
export default function clone<T>(value: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return JSON.parse(JSON.stringify(value));
}
