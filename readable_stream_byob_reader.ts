import {Defer} from "./defer.ts";
import {
  IsReadableStream,
  IsReadableStreamLocked,
  ReadableStream,
  ReadableStreamReadResult
} from "./readable_stream.ts";
import {Assert, isArrayBufferView} from "./util.ts";
import {
  ReadableStreamReader,
  ReadableStreamReaderGenericCancel,
  ReadableStreamReaderGenericInitialize,
  ReadableStreamReaderGenericRelease
} from "./readable_stream_reader.ts";
import {
  IsReadableByteStreamController,
  ReadableByteStreamControllerPullInto,
  ReadableByteStreamController
} from "./readable_byte_stream_controller.ts";

export class ReadableStreamBYOBReader
  implements ReadableStreamReader<ArrayBufferView> {
  readIntoRequests: { promise: Defer<any>; forAuthorCode: boolean }[];

  constructor(stream: ReadableStream) {
    if (!IsReadableStream(stream)) {
      throw new TypeError();
    }
    if (!IsReadableByteStreamController(stream.readableStreamController)) {
      throw new TypeError();
    }
    if (IsReadableStreamLocked(stream)) {
      throw new TypeError();
    }
    ReadableStreamReaderGenericInitialize(this, stream);
    this.readIntoRequests = [];
  }

  get closed(): Promise<undefined> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(new TypeError());
    }
    return this.closedPromise;
  }

  closedPromise: Defer<undefined>;
  ownerReadableStream: ReadableStream;

  cancel(reason): Promise<undefined> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read<T extends ArrayBufferView>(
    view: T
  ): Promise<ReadableStreamReadResult<T>> {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    if (typeof view !== "object") {
      return Promise.reject(new TypeError());
    }
    if (!isArrayBufferView(view)) {
      throw new TypeError("view is not ArrayBufferView: " + view);
    }
    return ReadableStreamBYOBReaderRead(this, view, true);
  }

  releaseLock() {
    if (!IsReadableStreamBYOBReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    if (this.readIntoRequests.length > 0) {
      throw new TypeError();
    }
    ReadableStreamReaderGenericRelease(this);
  }
}

export function IsReadableStreamBYOBReader(a): a is ReadableStreamBYOBReader {
  return typeof a === "object" && a.hasOwnProperty("readIntoRequests");
}

export function ReadableStreamBYOBReaderRead(
  reader: ReadableStreamBYOBReader,
  view: ArrayBufferView,
  forAuthorCode?: boolean
) {
  if (forAuthorCode === void 0) {
    forAuthorCode = false;
  }
  const stream = reader.ownerReadableStream;
  Assert(stream !== void 0);
  stream.disturbed = true;
  if (stream.state === "errored") {
    return Promise.reject(stream.storedError);
  }
  Assert(stream.state === "readable");
  return ReadableByteStreamControllerPullInto(
    stream.readableStreamController as ReadableByteStreamController,
    view,
    forAuthorCode
  );
}
