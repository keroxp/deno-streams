export type Defer<T> = {
  resolve(t: T);
  reject(e);
} & Promise<T>;

export function defer<T>(): Defer<T> {
  let res, rej;
  const promise = new Promise<T>((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  return Object.assign(promise, { resolve: res, reject: rej });
}
export function rejectDefer<T>(e) {
  return Object.assign(Promise.reject(e), {
    resolve: () => {},
    reject: () => {}
  });
}
export function resolveDefer<T>(e) {
  return Object.assign(Promise.resolve(e), {
    resolve: () => {},
    reject: () => {}
  });
}
