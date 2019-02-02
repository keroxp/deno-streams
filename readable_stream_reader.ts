import {
  IsReadableStream,
  IsReadableStreamLocked,
  ReadableStream,
  ReadableStreamCancel,
  ReadableStreamCreateReadResult,
  ReadableStreamReadResult
} from "./readable_stream.ts";
import {defer, Defer} from "./defer.ts";
import {Assert} from "./util.ts";
import {ReadableStreamBYOBReader} from "./readable_stream_byob_reader.ts";

export interface ReadableStreamReader<T = any> {
  readonly closed: Promise<any>;

  cancel(reason?): Promise<void>;

  read(view?: ArrayBufferView): Promise<ReadableStreamReadResult<T>>;

  releaseLock(): Promise<any>;
}

export class ReadableStreamDefaultReader<T = any>
  implements ReadableStreamReader<T> {
  readRequests: { promise: Defer<any>; forAuthorCode }[];

  constructor(stream: ReadableStream) {
    if (!IsReadableStream(stream)) {
      throw new TypeError();
    }
    if (IsReadableStreamLocked(stream)) {
      throw new TypeError();
    }
    ReadableStreamReaderGenericInitialize(this, stream);
    this.readRequests = [];
  }

  get closed(): Promise<undefined> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(new TypeError());
    }
    return this.closedPromise;
  }

  closedPromise: Defer<undefined>;
  ownerReadableStream: ReadableStream;

  cancel(reason?): Promise<void> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    return ReadableStreamReaderGenericCancel(this, reason);
  }

  read(): Promise<ReadableStreamReadResult<T>> {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    return ReadableStreamDefaultReaderRead(this, true);
  }

  releaseLock() {
    if (!IsReadableStreamDefaultReader(this)) {
      return Promise.reject(new TypeError());
    }
    if (this.ownerReadableStream === void 0) {
      return Promise.reject(new TypeError());
    }
    if (this.readRequests.length > 0) {
      throw new TypeError();
    }
    ReadableStreamReaderGenericRelease(this);
  }
}

export function IsReadableStreamDefaultReader<T>(
  a
): a is ReadableStreamDefaultReader<T> {
  return typeof a === "object" && a.hasOwnProperty("readRequests");
}

export function ReadableStreamReaderGenericCancel<T>(
  reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader<T>,
  reason
) {
  const stream = reader.ownerReadableStream;
  Assert(stream !== void 0);
  return ReadableStreamCancel(stream, reason);
}

export function ReadableStreamReaderGenericInitialize<T>(
  reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader<T>,
  stream: ReadableStream
) {
  reader.ownerReadableStream = stream;
  stream.reader = reader;
  if (stream.state === "readable") {
    reader.closedPromise = defer();
  } else if (stream.state === "closed") {
    reader.closedPromise = defer();
    reader.closedPromise.resolve(void 0);
  } else {
    Assert(stream.state === "errored");
    reader.closedPromise = defer();
    reader.closedPromise.reject(stream.storedError);
  }
}

export function ReadableStreamReaderGenericRelease<T>(
  reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader<T>
) {
  Assert(reader.ownerReadableStream !== void 0);
  Assert(reader.ownerReadableStream.reader === reader);
  if (reader.ownerReadableStream.state === "readable") {
    reader.closedPromise.reject(new TypeError());
  } else {
    reader.closedPromise.reject(new TypeError());
  }
  reader.ownerReadableStream.reader = void 0;
  reader.ownerReadableStream = void 0;
}

export function ReadableStreamDefaultReaderRead<T>(
  reader: ReadableStreamDefaultReader<T>,
  forAuthorCode: boolean = false
): Promise<{ value; done: boolean }> {
  const stream = reader.ownerReadableStream;
  Assert(stream !== void 0);
  stream.disturbed = true;
  if (stream.state === "closed") {
    return Promise.resolve(
      ReadableStreamCreateReadResult(void 0, true, forAuthorCode)
    );
  }
  if (stream.state === "errored") {
    return Promise.reject(stream.storedError);
  }
  Assert(stream.state === "readable");
  return stream.readableStreamController.PullSteps(forAuthorCode);
}
