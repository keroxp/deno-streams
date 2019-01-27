# deno-streams
[WIP] WHATWG streams API by TypeScript for deno

See: https://streams.spec.whatwg.org/

# compatibility table

- 🔰ReadableStream
  - 🔰new ReadableSteram(underlyingSource = {}, strategy = {})
  - 🔰get locked
  - 🔰cancel(reason)
  - ❌pipeThrough({ writable, readable }, { preventClose, preventAbort, preventCancel, signal } = {})
  - ❌pipeTo(dest, { preventClose, preventAbort, preventCancel, signal } = {})
  - 🔰tee()
- ❌WritableStream
- ❌TransformStream
- ❌ByteLengthQueuingStrategy
- ❌CountQueuingStrategy
