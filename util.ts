export function Assert(cond: boolean, desc?: string) {
  if (cond === false) throw new Error(desc);
}

export function isArrayBufferView(a): a is ArrayBufferView {
  return (
    a instanceof Int8Array ||
    a instanceof Uint8Array ||
    a instanceof Uint8ClampedArray ||
    a instanceof Int16Array ||
    a instanceof Uint16Array ||
    a instanceof Int32Array ||
    a instanceof Uint32Array ||
    a instanceof Float32Array ||
    a instanceof Float64Array ||
    a instanceof DataView
  );
}

export function isAbortSignal(x): x is domTypes.AbortSignal {
  return typeof x === "object" && x.hasOwnProperty("aborted");
}
