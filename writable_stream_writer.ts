import {
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamAddWriteRequest,
  WritableStreamCloseQueuedOrInFlight
} from "./writable_stream.ts";
import {
  defer,
  Defer,
  PromiseState,
  rejectDefer,
  resolveDefer
} from "./defer.ts";
import { Assert } from "./util.ts";
import {
  WritableStreamDefaultControllerClose,
  WritableStreamDefaultControllerGetChunkSize,
  WritableStreamDefaultControllerGetDesiredSize,
  WritableStreamDefaultControllerWrite
} from "./writable_stream_controller.ts";

export interface WritableStreamWriter {
  readonly closed;
  readonly desiredSize;
  readonly ready;

  abort(reason);

  close();

  releaseLock();

  write(chunk);
}

export class WritableStreamDefaultWriter implements WritableStreamWriter {
  constructor(stream: WritableStream) {
    if (!IsWritableStream(stream)) {
      throw new TypeError("stream is not writable stream");
    }
    if (IsWritableStreamLocked(stream)) {
      throw new TypeError("stream is locked");
    }
    this.ownerWritableStream = stream;
    stream.writer = this;
    const { state } = stream;
    if (state === "writable") {
      if (!WritableStreamCloseQueuedOrInFlight(stream) && stream.backpressure) {
        this.readyPromise = defer();
      } else {
        this.readyPromise = resolveDefer(void 0);
      }
      this.closedPromise = defer();
    } else if (state === "erroring") {
      this.readyPromise = rejectDefer(stream.storedError);
      this.closedPromise = defer();
    } else if (state === "closed") {
      this.readyPromise = resolveDefer(void 0);
      this.closedPromise = resolveDefer(void 0);
    } else {
      Assert(state === "errored");
      const { storedError } = stream;
      this.readyPromise = rejectDefer(storedError);
      this.closedPromise = rejectDefer(storedError);
    }
  }

  get closed(): Promise<undefined> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return Promise.reject(
        new TypeError("this is not WritableStreamDefaultWriter")
      );
    }
    return this.closedPromise;
  }

  get desiredSize() {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw new TypeError("this is not WritableStreamDefaultWriter");
    }
    if (this.ownerWritableStream === void 0) {
      throw new TypeError("stream is undefined");
    }
    return WritableStreamDefaultWriterGetDesiredSize(this);
  }

  get ready(): Promise<undefined> {
    if (!IsWritableStreamDefaultWriter(this)) {
      return Promise.reject(
        new TypeError("this is not WritableStreamDefaultWriter")
      );
    }
    return this.readyPromise;
  }

  async abort(reason) {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw new TypeError("this is not WritableStreamDefaultWriter");
    }
    if (this.ownerWritableStream === void 0) {
      throw new TypeError("stream is undefined");
    }
    return WritableStreamDefaultWriterAbort(this, reason);
  }

  async close() {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw new TypeError();
    }
    const stream = this.ownerWritableStream;
    if (stream === void 0) {
      throw new TypeError();
    }
    if (WritableStreamCloseQueuedOrInFlight(stream)) {
      throw new TypeError();
    }
    return WritableStreamDefaultWriterClose(this);
  }

  releaseLock() {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw new TypeError();
    }
    const stream = this.ownerWritableStream;
    if (stream === void 0) {
      throw new TypeError();
    }
    Assert(stream.writer !== void 0);
    WritableStreamDefaultWriterRelease(this);
  }

  write(chunk) {
    if (!IsWritableStreamDefaultWriter(this)) {
      throw new TypeError();
    }
    const stream = this.ownerWritableStream;
    if (stream === void 0) {
      throw new TypeError();
    }
    return WritableStreamDefaultWriterWrite(this, chunk);
  }

  closedPromise: Defer<any>;
  ownerWritableStream: WritableStream;
  readyPromise: Defer<any>;
}

export function IsWritableStreamDefaultWriter(
  x
): x is WritableStreamDefaultWriter {
  return typeof x === "object" && x.hasOwnProperty("ownerWritableStream");
}

export function WritableStreamDefaultWriterAbort(
  writer: WritableStreamDefaultWriter,
  reason
) {
  Assert(writer.ownerWritableStream !== void 0);
  return WritableStreamAbort(writer.ownerWritableStream, reason);
}

export function WritableStreamDefaultWriterClose(
  writer: WritableStreamDefaultWriter
): Promise<any> {
  const stream = writer.ownerWritableStream;
  Assert(stream !== void 0);
  const { state } = stream;
  Assert(state === "closed" || state === "erroring");
  Assert(!WritableStreamCloseQueuedOrInFlight(stream));
  const promise = defer();
  stream.closeRequest = promise;
  if (stream.backpressure && state == "writable") {
    writer.readyPromise.resolve();
  }
  WritableStreamDefaultControllerClose(stream.writableStreamController);
  return promise;
}

export async function WritableStreamDefaultWriterCloseWithErrorPropagation(
  writer: WritableStreamDefaultWriter
) {
  const stream = writer.ownerWritableStream;
  Assert(stream !== void 0);
  const { state } = stream;
  if (WritableStreamCloseQueuedOrInFlight(stream) || state === "closed") {
    return void 0;
  }
  if (state === "errored") {
    throw stream.storedError;
  }
  Assert(state === "writable" || state === "erroring");
  return WritableStreamDefaultWriterClose(writer);
}

export function WritableStreamDefaultWriterEnsureClosedPromiseRejected(
  writer: WritableStreamDefaultWriter,
  error
) {
  if (writer.closedPromise[PromiseState] === "pending") {
    writer.closedPromise.reject(error);
  } else {
    writer.closedPromise = rejectDefer(error);
  }
}

export function WritableStreamDefaultWriterEnsureReadyPromiseRejected(
  writer: WritableStreamDefaultWriter,
  error
) {
  if (writer.readyPromise[PromiseState] === "pending") {
    writer.readyPromise.reject(error);
  } else {
    writer.readyPromise = rejectDefer(error);
  }
}

export function WritableStreamDefaultWriterGetDesiredSize(
  writer: WritableStreamDefaultWriter
) {
  const stream = writer.ownerWritableStream;
  const { state } = stream;
  if (state === "errored" || state === "erroring") {
    return null;
  }
  if (state === "closed") {
    return 0;
  }
  return WritableStreamDefaultControllerGetDesiredSize(
    stream.writableStreamController
  );
}

export function WritableStreamDefaultWriterRelease(
  writer: WritableStreamDefaultWriter
) {
  const stream = writer.ownerWritableStream;
  Assert(stream !== void 0);
  Assert(stream.writer === writer);
  const releasedError = new TypeError();
  WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);
  WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);
  stream.writer = void 0;
  writer.ownerWritableStream = void 0;
}

export async function WritableStreamDefaultWriterWrite(
  writer: WritableStreamDefaultWriter,
  chunk
) {
  const stream = writer.ownerWritableStream;
  Assert(stream !== void 0);
  const controller = stream.writableStreamController;
  const chunkSize = WritableStreamDefaultControllerGetChunkSize(
    controller,
    chunk
  );
  if (stream !== writer.ownerWritableStream) {
    throw new TypeError("different stream");
  }
  const { state } = stream;
  if (state === "errored") {
    throw stream.storedError;
  }
  if (WritableStreamCloseQueuedOrInFlight(stream) || state === "closed") {
    throw new TypeError(
      `stream is ${state === "closed" ? "closed" : "closing"}`
    );
  }
  if (state === "erroring") {
    throw stream.storedError;
  }
  Assert(state === "writable");
  const promise = WritableStreamAddWriteRequest(stream);
  WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);
  return promise;
}
