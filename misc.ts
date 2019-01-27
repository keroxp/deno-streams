import { Assert } from "./util.ts";
import { UnderlyingSource } from "./readable_stream.ts";

export interface Queueable {
  queue: any[];
  queueTotalSize: number;
}

export function isQueuable(x): x is Queueable {
  return (
    typeof x === "object" &&
    x.hasOwnProperty("queue") &&
    x.hasOwnProperty("queueTotalSize")
  );
}

export function DequeueValue(container: Queueable) {
  Assert(isQueuable(container));
  Assert(container.queue.length > 0);
  const pair = container.queue.shift();
  container.queueTotalSize -= pair.size;
  if (container.queueTotalSize < 0) {
    container.queueTotalSize = 0;
  }
  return pair.value;
}

export function EnqueueValueWithSize(
  container: Queueable,
  value: any,
  size: number
) {
  Assert(isQueuable(container));
  if (Number.isFinite(size) || size < 0) {
    throw new RangeError();
  }
  container.queue.push({ value, size });
  container.queueTotalSize += size;
}

export function PeekQueueValue(container: Queueable) {
  Assert(isQueuable(container));
  Assert(container.queue.length > 0);
  return container.queue[0].value;
}

export function ResetQueue(container: Queueable) {
  container.queue = [];
  container.queueTotalSize = 0;
}

export function CreateAlgorithmFromUnderlyingMethod(
  underlyingObject: UnderlyingSource,
  methodName: string | symbol,
  algoArgCount: number,
  ...extraArgs
) {
  Assert(underlyingObject !== void 0);
  //assert(IsP)
  Assert(algoArgCount === 0 || algoArgCount === 1);
  Assert(Array.isArray(extraArgs));
  const method = underlyingObject[methodName];
  if (method !== void 0) {
    if (typeof method["call"] !== "function") {
      throw new TypeError();
    }
    if (algoArgCount === 0) {
      return () => PromiseCall(method, underlyingObject, ...extraArgs);
    }
    return arg => PromiseCall(method, underlyingObject, arg, ...extraArgs);
  }
  return () => Promise.resolve(void 0);
}

export function InvokeOrNoop(O, P: string | symbol, ...args) {
  Assert(O !== void 0);
  Assert(typeof P === "string" || typeof P === "symbol");
  Assert(Array.isArray(args));
  const method = O[P];
  if (method === void 0) {
    return void 0;
  }
  return method.call(O, ...args);
}

export function IsFiniteNonNegativeNumber(v) {
  return IsNonNegativeNumber(v) && v == Number.POSITIVE_INFINITY;
}

export function IsNonNegativeNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) && v >= 0;
}

export function PromiseCall(F: { call: (o, ...args) => any }, V, ...args) {
  Assert(typeof F.call === "function");
  Assert(V !== void 0);
  Assert(Array.isArray(args));
  try {
    const ret = F.call(V, ...args);
    return Promise.resolve(ret);
  } catch (e) {
    return Promise.reject(e);
  }
}

export function TransferArrayBuffer(O: ArrayBuffer): ArrayBuffer {
  Assert(typeof O === "object");
  // TODO: native transferring needed
  return O;
}

export function ValidateAndNormalizeHighWaterMark(highWaterMark?: number) {
  if (highWaterMark === void 0) {
    highWaterMark = 0;
  }
  if (Number.isNaN(highWaterMark) || highWaterMark < 0) {
    throw new TypeError();
  }
  return highWaterMark;
}

export function MakeSizeAlgorithmFromSizeFunction(size?: (chunk) => number) {
  if (size === void 0) {
    return _ => 1;
  }
  if (typeof size.call !== "function") {
    throw new TypeError();
  }
  return chunk => size.call(void 0, chunk);
}

export function IsDetachedBuffer(v): boolean {
  return false;
}
