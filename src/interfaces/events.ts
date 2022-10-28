export type EventFilter = { usecase?: string; profile?: string };

export interface IEvents<Params = unknown> {
  on<E extends keyof Params>(
    event: E,
    options: {
      priority: number;
      filter?: EventFilter;
    },
    callback: Params[E]
  ): void;
}
