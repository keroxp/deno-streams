import {assert, test} from "https://deno.land/x/testing@v0.2.6/mod.ts";
import {ReadableStream} from "./readable_stream.ts";
import {ReadableStreamDefaultController} from "./readable_stream_controller.ts";
import {assertEqual} from "https://deno.land/x/pretty_assert@0.1.4/mod.ts";
import {ReadableStreamDefaultReader} from "./readable_stream_reader.ts";

test(async function testReadableStream() {
  const src = [0, 1, 2, 3, 4, 5, 6];
  let i = 0;
  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
    },

    async pull(controller: ReadableStreamDefaultController) {
      controller.enqueue(src[i++]);
      if (i >= src.length) {
        controller.close();
        return;
      }
    }
  });
  const reader = stream.getReader() as ReadableStreamDefaultReader;
  for (let i = 0; i < src.length+1; i++) {
    const {value, done} = await reader.read();
    if (i < 7) {
      assertEqual(value, i);
    } else {
      assertEqual(true, done);
    }
  }
});

test(async function testReadableStream() {
  const src = [0, 1, 2, 3, 4, 5];
  let i = 0;
  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
    },

    async pull(controller: ReadableStreamDefaultController) {
      controller.enqueue(src.slice(i, i+2));
      i += 2;
      if (i >= src.length) {
        controller.close();
        return;
      }
    },
  }, {
    size: (chunk: number[]) => {
      return chunk.length;
    }
  });
  const reader = stream.getReader() as ReadableStreamDefaultReader;
  for (let i = 0; i < src.length+1; i+=2) {
    const {value, done} = await reader.read();
    if (i < src.length) {
      assertEqual(value, [i,i+1]);
    } else {
      assertEqual(true, done);
    }
  }
});