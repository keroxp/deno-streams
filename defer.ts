export const PromiseState = Symbol("PromiseState");
export type Defer<T> = {
  resolve(t?: T);
  reject(e?);
  [PromiseState]: "rejected" | "pending" | "resolved";
} & Promise<T>;

export function defer<T>(): Defer<T> {
  let res, rej;
  const promise = new Promise<T>((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  return Object.assign(promise, {
    resolve: (...args) => {
      res(...args);
      this[PromiseState] = "resolved";
    },
    reject: (...args) => {
      rej(...args);
      this[PromiseState] = "rejected";
    },
    [PromiseState]: "pending" as "pending"
  });
}

export function rejectDefer<T>(e): Defer<T> {
  return Object.assign(Promise.reject(e), {
    resolve: () => {},
    reject: () => {},
    [PromiseState]: "rejected" as "rejected"
  });
}

export function resolveDefer<T>(e) {
  return Object.assign(Promise.resolve(e), {
    resolve: () => {},
    reject: () => {},
    [PromiseState]: "resolved" as "resolved"
  });
}
