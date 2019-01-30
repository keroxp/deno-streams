export const PromiseState = Symbol("PromiseState");
export type Defer<T> = {
  resolve(t?: T);
  reject(e?);
  [PromiseState]: string;
} & Promise<T>;

export function defer<T>(): Defer<T> {
  let res, rej;
  const promise = new Promise<T>((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  const src = { resolve: null, reject: null, [PromiseState]: "pending" };
  src.resolve = (...args) => {
    res(...args);
    src[PromiseState] = "resolved";
  };
  src.reject = (...args) => {
    rej(...args);
    src[PromiseState] = "rejected";
  };
  return Object.assign(promise, src);
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
