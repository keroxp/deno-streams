import {
  IsReadableByteStreamController,
  IsReadableStreamBYOBReader,
  IsReadableStreamDefaultReader,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamReader,
  ReadableStreamReaderGenericRelease,
  SetUpReadableByteStreamController,
  SetUpReadableByteStreamControllerFromUnderlyingSource
} from "./readable_stream_reader.ts";
import { Assert, isAbortSignal } from "./util.ts";
import {
  ReadableByteStreamController,
  ReadableStreamController,
  ReadableStreamDefaultController,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError,
  SetUpReadableStreamDefaultController,
  SetUpReadableStreamDefaultControllerFromUnderlyingSource
} from "./readable_stream_controller.ts";
import {
  IsNonNegativeNumber,
  MakeSizeAlgorithmFromSizeFunction,
  ValidateAndNormalizeHighWaterMark
} from "./misc.ts";
import { defer } from "./defer.ts";
import {
  AcquireWritableStreamDefaultWriter,
  IsWritableStream,
  IsWritableStreamLocked,
  WritableStream,
  WritableStreamAbort,
  WritableStreamCloseQueuedOrInFlight
} from "./writable_stream.ts";
import {
  WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterGetDesiredSize,
  WritableStreamDefaultWriterRelease
} from "./writable_stream_writer.ts";
import {QueuingStrategy} from "./strategy.ts";

export type UnderlyingSource = {
  type?: "bytes";
  autoAllocateChunkSize?: number;
  start?: (controller: ReadableStreamController) => any;
  pull?: (controller: ReadableStreamController) => any;
  cancel?: CancelAlgorithm;
};

export type StartAlgorithm = () => any;
export type PullAlgorithm = () => Promise<any>;
export type CancelAlgorithm = (reason) => Promise<any>;
export type SizeAlgorithm = (chunk) => number;

export type ReadableStreamReadResult = { value; done: boolean };

export class ReadableStream {
  constructor(underlyingSource: UnderlyingSource, strategy: QueuingStrategy = {}) {
    InitializeReadableStream(this);
    let { highWaterMark, size } = strategy;
    const { type } = underlyingSource;
    if (type === "bytes") {
      if (size !== void 0) {
        throw new RangeError();
      }
      if (highWaterMark === void 0) {
        highWaterMark = 0;
      }
      highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);
      SetUpReadableByteStreamControllerFromUnderlyingSource(
        this,
        underlyingSource,
        highWaterMark
      );
    } else if (type === void 0) {
      const sizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(size);
      if (highWaterMark === void 0) {
        highWaterMark = 0;
      }
      highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);
      SetUpReadableStreamDefaultControllerFromUnderlyingSource({
        stream: this,
        underlyingSource,
        highWaterMark,
        sizeAlgorithm
      });
    } else {
      throw new RangeError();
    }
  }

  get locked(): boolean {
    if (!IsReadableStream(this)) {
      throw new TypeError();
    }
    return IsReadableStreamLocked(this);
  }

  cancel(reason): Promise<undefined> {
    if (IsReadableStream(this)) {
      return Promise.reject(new TypeError());
    }
    if (IsReadableStreamLocked(this)) {
      return Promise.reject(new TypeError());
    }
    return ReadableStreamCancel(this, reason);
  }

  getReader(params: { mode?: "byob" } = {}): ReadableStreamReader {
    if (!IsReadableStream(this)) {
      throw new TypeError();
    }
    if (params.mode === void 0) {
      return AcquireReadableStreamDefaultReader(this);
    }
    if (params.mode === "byob") {
      return AcquireReadableStreamBYOBReader(this);
    }
    throw new RangeError();
  }

  pipeThrough(
    {
      writable,
      readable
    }: {
      writable: WritableStream;
      readable: ReadableStream;
    },
    {
      preventClose,
      preventAbort,
      preventCancel,
      signal
    }: {
      preventClose?: boolean;
      preventAbort?: boolean;
      preventCancel?: boolean;
      signal?: domTypes.AbortSignal;
    } = {}
  ) {
    if (!IsReadableStream(this)) {
      throw new TypeError("this is not ReadableStream");
    }
    if (!IsWritableStream(writable)) {
      throw new TypeError("writable is not WritableStream");
    }
    if (!IsReadableStream(readable)) {
      throw new TypeError("readable is not ReadableStream");
    }
    preventClose = !!preventClose;
    preventAbort = !!preventAbort;
    preventCancel = !!preventCancel;
    if (signal !== void 0 && !isAbortSignal(signal)) {
      throw new TypeError("signal is not instance of AbortSignal");
    }
    if (IsReadableStreamLocked(this)) {
      throw new TypeError("this stream is locked");
    }
    if (IsWritableStreamLocked(writable)) {
      throw new TypeError("writable is locked");
    }
    ReadableStreamPipeTo({
      source: this,
      dest: writable,
      preventClose,
      preventAbort,
      preventCancel,
      signal
    });
    return readable;
  }

  async pipeTo(
    dest: WritableStream,
    {
      preventClose,
      preventAbort,
      preventCancel,
      signal
    }: {
      preventClose?: boolean;
      preventAbort?: boolean;
      preventCancel?: boolean;
      signal?;
    } = {}
  ): Promise<any> {
    if (!IsReadableStream(this)) {
      throw new TypeError("this is not ReadableStream");
    }
    if (!IsWritableStream(dest)) {
      throw new TypeError("dest is not WritableStream");
    }
    preventClose = !!preventClose;
    preventAbort = !!preventAbort;
    preventCancel = !!preventCancel;
    if (signal !== void 0 && !isAbortSignal(signal)) {
      throw new TypeError("signal is not instance of AbortSignal");
    }
    if (IsReadableStreamLocked(this)) {
      throw new TypeError("this stream is locked");
    }
    if (IsWritableStreamLocked(dest)) {
      throw new TypeError("writable is locked");
    }
    return ReadableStreamPipeTo({
      source: this,
      dest,
      preventClose,
      preventCancel,
      preventAbort,
      signal
    });
  }

  tee(): [ReadableStream, ReadableStream] {
    if (!IsReadableStream(this)) {
      throw new TypeError();
    }
    return ReadableStreamTee(this, false);
  }

  disturbed: boolean;
  readableStreamController:
    | ReadableByteStreamController
    | ReadableStreamDefaultController;
  reader: ReadableStreamDefaultReader | ReadableStreamBYOBReader;
  state: "readable" | "closed" | "errored";
  storedError: Error;
}

function AcquireReadableStreamBYOBReader(
  stream: ReadableStream
): ReadableStreamBYOBReader {
  return new ReadableStreamBYOBReader(stream);
}

function AcquireReadableStreamDefaultReader(
  stream: ReadableStream
): ReadableStreamDefaultReader {
  return new ReadableStreamDefaultReader(stream);
}

function CreateReadableStreamInternal(
  params: {
    startAlgorithm: StartAlgorithm;
    pullAlgorithm: PullAlgorithm;
    cancelAlgorithm: CancelAlgorithm;
    highWaterMark?: number;
    sizeAlgorithm?: SizeAlgorithm;
    autoAllocateChunkSize?: number;
  },
  bytes: boolean
): ReadableStream {
  const {
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm,
    autoAllocateChunkSize
  } = params;
  let { highWaterMark, sizeAlgorithm } = params;
  if (highWaterMark === void 0) {
    highWaterMark = 1;
  }
  if (sizeAlgorithm === void 0) {
    sizeAlgorithm = () => 1;
  }
  Assert(IsNonNegativeNumber(sizeAlgorithm));
  const stream = new ReadableStream(
    {
      start: startAlgorithm,
      pull: pullAlgorithm,
      cancel: cancelAlgorithm
    },
    {
      size: sizeAlgorithm,
      highWaterMark
    }
  );
  InitializeReadableStream(stream);
  let controller;
  if (bytes) {
    controller = Object.create(ReadableByteStreamController.prototype);
    SetUpReadableByteStreamController({
      stream,
      controller,
      startAlgorithm,
      pullAlgorithm,
      cancelAlgorithm,
      highWaterMark,
      autoAllocateChunkSize
    });
  } else {
    controller = Object.create(ReadableStreamDefaultController.prototype);
    SetUpReadableStreamDefaultController({
      stream,
      controller,
      startAlgorithm,
      pullAlgorithm,
      cancelAlgorithm,
      highWaterMark,
      sizeAlgorithm
    });
  }
  return stream;
}

export function CreateReadableStream(params: {
  startAlgorithm: StartAlgorithm;
  pullAlgorithm: PullAlgorithm;
  cancelAlgorithm: CancelAlgorithm;
  highWaterMark?: number;
  sizeAlgorithm?: SizeAlgorithm;
}): ReadableStream {
  return CreateReadableStreamInternal(params, false);
}

export function CreateReadableByteStream(params: {
  startAlgorithm: StartAlgorithm;
  pullAlgorithm: PullAlgorithm;
  cancelAlgorithm: CancelAlgorithm;
  highWaterMark?: number;
  sizeAlgorithm?: SizeAlgorithm;
}) {
  return CreateReadableStreamInternal(params, true);
}

export function InitializeReadableStream(stream: ReadableStream) {
  stream.state = "readable";
  stream.reader = void 0;
  stream.storedError = void 0;
  stream.disturbed = false;
}

export function IsReadableStream(x): x is ReadableStream {
  return typeof x === "object" && x.hasOwnProperty("readableStreamController");
}

export function IsReadableStreamDisturbed(stream: ReadableStream): boolean {
  Assert(IsReadableStream(stream));
  return stream.disturbed;
}

export function IsReadableStreamLocked(stream: ReadableStream): boolean {
  Assert(IsReadableStream(stream));
  return stream.reader !== void 0;
}

export function ReadableStreamTee(
  stream: ReadableStream,
  cloneForBranch2: boolean
): [ReadableStream, ReadableStream] {
  Assert(IsReadableStream(stream));
  Assert(typeof cloneForBranch2 === "boolean");
  const reader = AcquireReadableStreamDefaultReader(stream);
  let closedOrErrored = false;
  let canceled1 = false;
  let canceled2 = false;
  let reason1 = void 0;
  let reason2 = void 0;
  let branch1: ReadableStream = void 0;
  let branch2: ReadableStream = void 0;
  let cancelPromise = defer();
  const pullAlgorithm: PullAlgorithm = () => {
    return ReadableStreamDefaultReaderRead(reader).then(
      (result: { value; done: boolean }) => {
        Assert(typeof result === "object");
        const { value, done } = result;
        Assert(typeof done === "boolean");
        if (done && !closedOrErrored) {
          if (!canceled1) {
            ReadableStreamDefaultControllerClose(
              branch1.readableStreamController as ReadableStreamDefaultController
            );
          }
          if (!canceled2) {
            ReadableStreamDefaultControllerClose(
              branch2.readableStreamController as ReadableStreamDefaultController
            );
          }
        }
        if (closedOrErrored) {
          return;
        }
        let [value1, value2] = [value, value];
        if (!canceled2 && cloneForBranch2) {
          //value2 <- ?StructuredDeserialize( ? StructuredSerialize( value2 ), 現在の Realm Record )
        }
        if (!canceled1) {
          ReadableStreamDefaultControllerEnqueue(
            branch1.readableStreamController as ReadableStreamDefaultController,
            value1
          );
        }
        if (!canceled2) {
          ReadableStreamDefaultControllerEnqueue(
            branch1.readableStreamController as ReadableStreamDefaultController,
            value2
          );
        }
      }
    );
  };
  const cancel1Algorithm: CancelAlgorithm = reason => {
    canceled1 = true;
    reason1 = reason;
    if (canceled2) {
      const compositeReason = [reason1, reason2];
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      cancelPromise.resolve(cancelResult);
    }
    return cancelPromise;
  };
  const cancel2Algorithm: CancelAlgorithm = reason => {
    canceled2 = true;
    reason2 = reason;
    if (canceled1) {
      const compositeReason = [reason1, reason2];
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      cancelPromise.resolve(cancelResult);
    }
    return cancelPromise;
  };
  const startAlgorithm: StartAlgorithm = () => void 0;
  branch1 = CreateReadableStream({
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm: cancel1Algorithm
  });
  branch2 = CreateReadableStream({
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm: cancel2Algorithm
  });
  reader.closedPromise.catch(r => {
    if (!closedOrErrored) {
      ReadableStreamDefaultControllerError(
        branch1.readableStreamController as ReadableStreamDefaultController,
        r
      );
      ReadableStreamDefaultControllerError(
        branch2.readableStreamController as ReadableStreamDefaultController,
        r
      );
      closedOrErrored = true;
    }
  });
  return [branch1, branch2];
}

export async function ReadableStreamPipeTo({
  source,
  dest,
  preventClose,
  preventAbort,
  preventCancel,
  signal
}: {
  source: ReadableStream;
  dest: WritableStream;
  preventClose: boolean;
  preventAbort: boolean;
  preventCancel: boolean;
  signal?;
}) {
  Assert(IsReadableStream(source));
  Assert(IsWritableStream(dest));
  Assert(typeof preventCancel === "boolean");
  Assert(typeof preventAbort === "boolean");
  Assert(typeof preventClose === "boolean");
  Assert(signal === void 0 || isAbortSignal(signal));
  Assert(!IsReadableStreamLocked(source));
  Assert(!IsWritableStreamLocked(dest));
  let reader: ReadableStreamBYOBReader | ReadableStreamDefaultReader;
  if (IsReadableByteStreamController(source.readableStreamController)) {
    reader = AcquireReadableStreamBYOBReader(source);
  } else {
    reader = AcquireReadableStreamDefaultReader(source);
  }
  const writer = AcquireWritableStreamDefaultWriter(dest);
  let shutingDown = false;
  const promsie = defer();
  let abortAlgorithm;
  if (!signal) {
    abortAlgorithm = () => {
      let error = new Error("aborted");
      const actions = [];
      if (!preventAbort) {
        actions.push(async () => {
          if (dest.state === "writable") {
            return WritableStreamAbort(dest, error);
          }
        });
      }
      if (!preventCancel) {
        actions.push(async () => {
          if (source.state === "readable") {
            return ReadableStreamCancel(source, error);
          }
        });
      }
      shutdown(error, () => Promise.all(actions.map(p => p())));
      if (signal.aborted) {
        abortAlgorithm();
        return promsie;
      }
      signal.addEventListener("onabort", abortAlgorithm);
    };
  }
  const finalize = (error?) => {
    WritableStreamDefaultWriterRelease(writer);
    ReadableStreamReaderGenericRelease(reader);
    if (signal) {
      signal.removeEventListener("onabort", abortAlgorithm);
    }
    if (error) {
      promsie.reject(error);
    } else {
      promsie.resolve();
    }
  };
  const shutdown = (err?, action?: () => Promise<any>) => {
    if (shutingDown) {
      return;
    }
    shutingDown = true;
    if (
      dest.state === "writable" ||
      !WritableStreamCloseQueuedOrInFlight(dest)
    ) {
    }
    if (!action) {
      finalize(err);
      return;
    }
    action()
      .then(() => finalize(err))
      .catch(finalize);
  };
  (async () => {
    while (true) {
      const desiredSize = WritableStreamDefaultWriterGetDesiredSize(writer);
      if (desiredSize === null || desiredSize <= 0) {
        return;
      }
      if (source.state === "errored") {
        if (!preventAbort) {
          shutdown(source.storedError, () => {
            return WritableStreamAbort(dest, source.storedError);
          });
        } else {
          shutdown(source.storedError);
        }
      } else if (dest.state === "errored") {
        if (!preventCancel) {
          shutdown(dest.storedError, () => {
            return ReadableStreamCancel(source, dest.storedError);
          });
        } else {
          shutdown(dest.storedError);
        }
      } else if (source.state === "closed") {
        if (!preventClose) {
          shutdown(void 0, () => {
            return WritableStreamDefaultWriterCloseWithErrorPropagation(writer);
          });
        } else {
          shutdown();
        }
      } else if (
        WritableStreamCloseQueuedOrInFlight(dest) ||
        dest.state === "closed"
      ) {
        const destClosed = new TypeError();
        if (!preventCancel) {
          shutdown(destClosed, () => {
            return ReadableStreamCancel(source, destClosed);
          });
        } else {
          shutdown(destClosed);
        }
      }
      if (IsReadableStreamBYOBReader(reader)) {
        let view = new Uint8Array(desiredSize);
        const { done } = await reader.read(view);
        if (done) break;
        await writer.write(view);
      } else {
        const { value, done } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    }
  })();
  return promsie;
}

export function ReadableStreamAddReadIntoRequest(
  stream: ReadableStream,
  forAuthorCode
) {
  Assert(IsReadableStreamBYOBReader(stream.reader));
  const reader = stream.reader as ReadableStreamBYOBReader;
  Assert(stream.state === "readable" || stream.state === "closed");
  const promise = defer();
  const readIntoRequest = { promise, forAuthorCode };
  reader.readIntoRequests.push(readIntoRequest);
  return promise;
}

export function ReadableStreamAddReadRequest(
  stream: ReadableStream,
  forAuthorCode
): Promise<{ value; done: boolean }> {
  Assert(IsReadableStreamDefaultReader(stream.reader));
  const reader = stream.reader as ReadableStreamDefaultReader;
  Assert(stream.state === "readable" || stream.state === "closed");
  const promise = defer<{ value; done: boolean }>();
  const readIntoRequest = { promise, forAuthorCode };
  reader.readRequests.push(readIntoRequest);
  return promise;
}

export function ReadableStreamCancel(
  stream: ReadableStream,
  reason
): Promise<undefined> {
  stream.disturbed = true;
  if (stream.state === "closed") {
    return Promise.reject(void 0);
  }
  if (stream.state === "errored") {
    return Promise.reject(stream.storedError);
  }
  ReadableStreamClose(stream);
  const sourceCancelPromise = stream.readableStreamController.cancelAlgorithm(
    reason
  );
  return sourceCancelPromise.then(() => void 0);
}

export function ReadableStreamClose(stream: ReadableStream) {
  Assert(stream.state === "readable");
  stream.state = "closed";
  const reader = stream.reader;
  if (reader === void 0) {
    return;
  }
  if (IsReadableStreamDefaultReader(reader)) {
    for (let req of reader.readRequests) {
      const resolved = ReadableStreamCreateReadResult(
        void 0,
        true,
        req.forAuthorCode
      );
      req.promise.resolve(resolved);
    }
    reader.readRequests = [];
  }
  reader.closedPromise.resolve(void 0);
}

export function ReadableStreamCreateReadResult<T>(
  value,
  done: boolean,
  forAuthorCode: boolean
): ReadableStreamReadResult {
  const ret = forAuthorCode ? Object.create({}) : Object.create(null);
  ret["value"] = value as T;
  ret["done"] = done;
  return { value, done };
}

export function ReadableStreamError(stream: ReadableStream, e) {
  Assert(IsReadableStream(stream));
  Assert(stream.state === "readable");
  stream.state = "errored";
  stream.storedError = e;
  const reader = stream.reader;
  if (stream.reader === void 0) {
    return;
  }
  if (IsReadableStreamDefaultReader(reader)) {
    for (const req of reader.readRequests) {
      req.promise.reject(e);
    }
    reader.readRequests = [];
  } else if (IsReadableStreamBYOBReader(reader)) {
    for (const req of reader.readIntoRequests) {
      req.promise.reject(e);
    }
    reader.readIntoRequests = [];
  }
  reader.closedPromise.reject(e);
  //TODO: Set reader.[[closedPromise]].[[PromiseIsHandled]] to true.
}

export function ReadableStreamFulfillReadIntoRequest(
  stream: ReadableStream,
  chunk,
  done
) {
  const reader = stream.reader;
  const req = (<ReadableStreamBYOBReader>reader).readIntoRequests.shift();
  req.promise.resolve(
    ReadableStreamCreateReadResult(chunk, done, req.forAuthorCode)
  );
}

export function ReadableStreamFulfillReadRequest(
  stream: ReadableStream,
  chunk,
  done
) {
  const reader = stream.reader;
  const req = (<ReadableStreamDefaultReader>reader).readRequests.shift();
  req.promise.resolve(
    ReadableStreamCreateReadResult(chunk, done, req.forAuthorCode)
  );
}

export function ReadableStreamGetNumReadIntoRequests(stream: ReadableStream) {
  return (<ReadableStreamBYOBReader>stream.reader).readIntoRequests.length;
}

export function ReadableStreamGetNumReadRequests(stream) {
  return (<ReadableStreamDefaultReader>stream.reader).readRequests.length;
}

export function ReadableStreamHasBYOBReader(stream: ReadableStream): boolean {
  const reader = stream.reader;
  if (reader === void 0) {
    return false;
  }
  return IsReadableStreamBYOBReader(reader);
}

export function ReadableStreamHasDefaultReader(stream): boolean {
  const reader = stream.reader;
  if (reader === void 0) {
    return false;
  }
  return IsReadableStreamDefaultReader(reader);
}
