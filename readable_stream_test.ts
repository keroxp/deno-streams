import {
  assertEqual,
  setFilter,
  test
} from "https://deno.land/x/testing@v0.2.6/mod.ts";
import { ReadableStream } from "./readable_stream.ts";
import {
  ReadableStreamController,
  ReadableStreamDefaultController
} from "./readable_stream_controller.ts";
import {
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader
} from "./readable_stream_reader.ts";

test(async function testReadableStream() {
  const src = [0, 1, 2, 3, 4, 5, 6];
  let i = 0;
  const stream = new ReadableStream({
    async pull(controller: ReadableStreamController) {
      controller.enqueue(src[i++]);
      if (i >= src.length) {
        controller.close();
        return;
      }
    }
  });
  const reader = stream.getReader() as ReadableStreamDefaultReader;
  for (let i = 0; i < src.length + 1; i++) {
    const { value, done } = await reader.read();
    if (i < 7) {
      assertEqual(value, i);
    } else {
      assertEqual(true, done);
    }
  }
});

test(async function testReadableStream2() {
  const src = [0, 1, 2, 3, 4, 5];
  let i = 0;
  const stream = new ReadableStream(
    {
      async start(controller: ReadableStreamDefaultController) {
        console.log(controller.enqueue);
      },

      async pull(controller: ReadableStreamDefaultController) {
        console.log(controller.enqueue);
        controller.enqueue(src.slice(i, i + 2));
        i += 2;
        if (i >= src.length) {
          controller.close();
          return;
        }
      }
    },
    {
      size: (chunk: number[]) => {
        return chunk.length;
      }
    }
  );
  const reader = stream.getReader() as ReadableStreamDefaultReader;
  for (let i = 0; i < src.length + 1; i += 2) {
    const { value, done } = await reader.read();
    if (i < src.length) {
      assertEqual(value, [i, i + 1]);
    } else {
      assertEqual(true, done);
    }
  }
});

test(async function testReadableStream3() {
  const src = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const stream = new ReadableStream({
    type: "bytes",
    async start(controller: ReadableStreamController) {
      controller.enqueue(src);
    },
    async pull(controller: ReadableStreamController) {
      controller.close();
    }
  });
  const reader = stream.getReader({ mode: "byob" });
  assertEqual(reader.constructor, ReadableStreamBYOBReader);
  const buf = new Uint8Array(4);
  const res1 = await reader.read(buf);
  assertEqual(res1.done, false);
  assertEqual([...buf], [0, 1, 2, 3]);
  const res2 = await reader.read(buf);
  assertEqual(res2.done, false);
  assertEqual([...buf], [4, 5, 6, 7]);
  const res3 = await reader.read(buf);
  assertEqual(res3.done, true);
  assertEqual(stream.state, "closed");
});

test(async function testReadableStream4() {
  const src = new Uint16Array([0x1234, 0x5678]);
  const stream = new ReadableStream({
    type: "bytes",
    async start(controller: ReadableStreamController) {
      controller.enqueue(src);
    },
    async pull(controller: ReadableStreamController) {
      controller.close();
    }
  });
  const reader = stream.getReader({ mode: "byob" });
  assertEqual(reader.constructor, ReadableStreamBYOBReader);
  const buf = new Uint8Array(2);
  const res1 = await reader.read(buf);
  assertEqual(res1.done, false);
  let view = new DataView(buf.buffer);
  assertEqual(view.getInt16(0, true), 0x1234);
  const res2 = await reader.read(buf);
  view = new DataView(buf.buffer);
  assertEqual(res2.done, false);
  assertEqual(view.getInt16(0, true), 0x5678);
  const res3 = await reader.read(buf);
  assertEqual(res3.done, true);
  assertEqual(stream.state, "closed");
});
