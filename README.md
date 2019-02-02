# deno-streams
[WIP] WHATWG streams API by TypeScript for deno

See: https://streams.spec.whatwg.org/

# compatibility table

- 🔰ReadableStream
  - 🔰 `new ReadableStream(underlyingSource = {}, strategy = {})`
  - 🔰 `get locked`
  - 🔰 `cancel(reason)`n
  - 🔰 `pipeThrough({ writable, readable }, { preventClose, preventAbort, preventCancel, signal } = {})`
  - 🔰 `pipeTo(dest, { preventClose, preventAbort, preventCancel, signal } = {})`
  - 🔰 `tee()`
- 🔰WritableStream
  - 🔰`new WritableStream( underlyingSink = {}, strategy = {} )`
  - 🔰`get locked`
  - 🔰`abort( reason )`
  - 🔰`getWriter()`
- 🔰TransformStream
  - 🔰 `new TransformStream( transformer = {}, writableStrategy = {}, readableStrategy = {} )`
  - 🔰 `get readable`
  - 🔰 `get writable`
- 🔰ByteLengthQueuingStrategy
- 🔰CountQueuingStrategy
# Usage

```ts

import { ReadableStream } from "https://denopkg.com/keroxp/deno-streams/readable_stream.ts"
import { WritableStream } from "https://denopkg.com/keroxp/deno-streams/writable_stream.ts"

const src = [0,1,2,3,4]
let i = 0
const dest = []
const readable = new ReadableStream<number>({
    pull: controller => {
        controller.enqueue(src[i++])
        if (i >= src.length) controller.close()
    }
})
const writable = new WritableStream<number>({
    write: chunk => {
        dest.push(chunk)
    }
})
await readable.pipeTo(writable)
console.log(dest) // => [0,1,2,3,4]
```
