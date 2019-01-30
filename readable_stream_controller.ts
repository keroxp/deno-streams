import { Assert } from "./util.ts";
import {
  IsReadableByteStreamController,
  ReadableByteStreamControllerCallPullIfNeeded,
  ReadableByteStreamControllerClearAlgorithms,
  ReadableByteStreamControllerClose,
  ReadableByteStreamControllerEnqueue,
  ReadableByteStreamControllerError,
  ReadableByteStreamControllerGetDesiredSize,
  ReadableByteStreamControllerHandleQueueDrain,
  SetUpReadableStreamBYOBRequest
} from "./readable_stream_reader.ts";
import {
  ReadableStreamBYOBRequest,
  ReadableStreamBYOBRequestImpl
} from "./readable_stream_request.ts";
import {
  CancelAlgorithm,
  IsReadableStreamLocked,
  PullAlgorithm,
  ReadableStream,
  ReadableStreamAddReadRequest,
  ReadableStreamClose,
  ReadableStreamCreateReadResult,
  ReadableStreamError,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadRequests,
  ReadableStreamHasDefaultReader,
  ReadableStreamReadResult,
  SizeAlgorithm,
  StartAlgorithm,
  UnderlyingSource
} from "./readable_stream.ts";

import {
  CreateAlgorithmFromUnderlyingMethod,
  DequeueValue,
  EnqueueValueWithSize,
  InvokeOrNoop,
  ResetQueue
} from "./misc.ts";

export type PullIntoDescriptor = {
  buffer: ArrayBuffer;
  byteOffset: number;
  bytesFilled: number;
  byteLength: number;
  elementSize: number;
  ctor: any;
  readerType: string;
};

export interface ReadableStreamController<T> {
  readonly byobRequest?: ReadableStreamBYOBRequest;

  readonly desiredSize: number;

  close(): void;

  enqueue(chunk: T): void;

  error(e): void;
}

abstract class ReadableStreamControllerBase {
  autoAllocateChunkSize: number;

  cancelAlgorithm: CancelAlgorithm;

  closeRequested: boolean;
  pullAgain: boolean;

  pullAlgorithm: PullAlgorithm;

  pulling: boolean;
  pendingPullIntos: PullIntoDescriptor[];
  queue: {
    buffer: ArrayBuffer;
    byteLength: number;
    byteOffset: number;
  }[];
  queueTotalSize;
  started: boolean;
  strategyHWM: number;

  //
}

export class ReadableByteStreamController extends ReadableStreamControllerBase
  implements ReadableStreamController<ArrayBufferView> {
  constructor() {
    super();
    throw new TypeError();
  }

  controlledReadableByteStream: ReadableStream;
  _byobRequest: ReadableStreamBYOBRequestImpl;
  get byobRequest(): ReadableStreamBYOBRequest {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError();
    }
    if (this._byobRequest === void 0 && this.pendingPullIntos.length > 0) {
      const firstDescriptor = this.pendingPullIntos[0];
      const { buffer, byteOffset, bytesFilled, byteLength } = firstDescriptor;
      const view = new Uint8Array(
        buffer,
        byteOffset + bytesFilled,
        byteLength - bytesFilled
      );
      const byobRequest = Object.create(
        ReadableStreamBYOBRequestImpl.prototype
      );
      SetUpReadableStreamBYOBRequest(byobRequest, this, view);
      this._byobRequest = byobRequest;
    }
    return this._byobRequest;
  }

  get desiredSize(): number {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError();
    }
    return ReadableByteStreamControllerGetDesiredSize(this);
  }

  close(): void {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError();
    }
    if (this.closeRequested) {
      throw new TypeError();
    }
    if (this.controlledReadableByteStream.state !== "readable") {
      throw new TypeError();
    }
    ReadableByteStreamControllerClose(this);
  }

  enqueue(chunk: ArrayBufferView): void {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError();
    }
    if (this.closeRequested) {
      throw new TypeError();
    }
    if (this.controlledReadableByteStream.state !== "readable") {
      throw new TypeError();
    }
    if (typeof chunk !== "object") {
      throw new TypeError();
    }
    // if (!chunk.hasOwnProperty("ViewedArrayBuffer")) {
    //   throw new TypeError();
    // }
    // if (
    //   chunk.ViewedArrayBuffer.hasOwnProperty("ArrayBufferData") &&
    //   chunk.ViewedArrayBuffer["ArrayBufferData"] === null
    // ) {
    //   throw new TypeError();
    // }
    ReadableByteStreamControllerEnqueue(this, chunk);
  }

  error(e): void {
    if (!IsReadableByteStreamController(this)) {
      throw new TypeError();
    }
    ReadableByteStreamControllerError(this, e);
  }

  CancelSteps(reason): Promise<any> {
    ResetQueue(this);
    const result = this.cancelAlgorithm(reason);
    ReadableByteStreamControllerClearAlgorithms(this);
    return result;
  }

  PullSteps(
    forAuthorCode?: boolean
  ): Promise<ReadableStreamReadResult<ArrayBufferView>> {
    const stream = this.controlledReadableByteStream;
    Assert(ReadableStreamHasDefaultReader(stream));
    if (this.queueTotalSize > 0) {
      Assert(ReadableStreamGetNumReadRequests(stream) === 0);
      const entry = this.queue.shift();
      this.queueTotalSize -= entry.byteLength;
      ReadableByteStreamControllerHandleQueueDrain(this);
      const view = new Uint8Array(
        entry.buffer,
        entry.byteOffset,
        entry.byteLength
      );
      return Promise.resolve(
        ReadableStreamCreateReadResult(view, false, forAuthorCode)
      );
    }
    const { autoAllocateChunkSize } = this;
    if (autoAllocateChunkSize !== void 0) {
      let buffer: ArrayBuffer;
      try {
        buffer = new ArrayBuffer(autoAllocateChunkSize);
      } catch (e) {
        return Promise.reject(e);
      }
      const pullIntoDescriptor: PullIntoDescriptor = {
        buffer,
        byteOffset: 0,
        byteLength: autoAllocateChunkSize,
        bytesFilled: 0,
        elementSize: 1,
        ctor: Uint8Array,
        readerType: "default"
      };
      this.pendingPullIntos.push(pullIntoDescriptor);
    }
    const promise = ReadableStreamAddReadRequest(stream, forAuthorCode);
    ReadableByteStreamControllerCallPullIfNeeded(this);
    return promise;
  }
}

export class ReadableStreamDefaultController<T>
  extends ReadableStreamControllerBase
  implements ReadableStreamController<T> {
  constructor() {
    super();
    throw new TypeError();
  }

  controlledReadableStream: ReadableStream;
  strategySizeAlgorithm: (chunk) => number;

  get desiredSize(): number {
    if (!IsReadableStreamDefaultController(this)) {
      throw new TypeError();
    }
    return ReadableStreamDefaultControllerGetDesiredSize(this);
  }

  close(): void {
    if (!IsReadableStreamDefaultController(this)) {
      throw new TypeError();
    }
    if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
      throw new TypeError();
    }
    ReadableStreamDefaultControllerClose(this);
  }

  enqueue(chunk: T): void {
    if (!IsReadableStreamDefaultController(this)) {
      throw new TypeError();
    }
    if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
      throw new TypeError();
    }
    return ReadableStreamDefaultControllerEnqueue(this, chunk);
  }

  error(e): void {
    if (!IsReadableStreamDefaultController(this)) {
      throw new TypeError();
    }
    ReadableStreamDefaultControllerError(this, e);
  }

  CancelSteps(reason): Promise<any> {
    ResetQueue(this);
    const result = this.cancelAlgorithm(reason);
    ReadableStreamDefaultControllerClearAlgorithms(this);
    return result;
  }

  PullSteps(forAuthorCode?: boolean): Promise<any> {
    const stream = this.controlledReadableStream;
    if (this.queue.length > 0) {
      const chunk = DequeueValue(this);
      if (this.closeRequested && this.queue.length === 0) {
        ReadableStreamDefaultControllerClearAlgorithms(this);
        ReadableStreamClose(stream);
      } else {
        ReadableStreamDefaultControllerCallPullIfNeeded(this);
      }
      return Promise.resolve(
        ReadableStreamCreateReadResult(chunk, false, forAuthorCode)
      );
    }
    const pendingPromise = ReadableStreamAddReadRequest(stream, forAuthorCode);
    ReadableStreamDefaultControllerCallPullIfNeeded(this);
    return pendingPromise;
  }
}

export function IsReadableStreamDefaultController<T>(
  x
): x is ReadableStreamDefaultController<T> {
  return typeof x === "object" && x.hasOwnProperty("controlledReadableStream");
}

export function ReadableStreamDefaultControllerCallPullIfNeeded<T>(
  controller: ReadableStreamDefaultController<T>
) {
  const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
  if (!shouldPull) {
    return;
  }
  if (controller.pulling) {
    controller.pullAgain = true;
    return;
  }
  Assert(!controller.pullAgain);
  controller.pulling = true;
  controller
    .pullAlgorithm()
    .then(() => {
      controller.pulling = false;
      if (controller.pullAgain) {
        controller.pullAgain = false;
        ReadableStreamDefaultControllerCallPullIfNeeded(controller);
      }
    })
    .catch(r => {
      ReadableStreamDefaultControllerError(controller, r);
    });
}

export function ReadableStreamDefaultControllerShouldCallPull<T>(
  controller: ReadableStreamDefaultController<T>
) {
  const stream = controller.controlledReadableStream;
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
    return false;
  }
  if (!controller.started) {
    return false;
  }
  if (
    IsReadableStreamLocked(stream) &&
    ReadableStreamGetNumReadRequests(stream) > 0
  ) {
    return true;
  }
  const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
  Assert(desiredSize !== null);
  return desiredSize > 0;
}

export function ReadableStreamDefaultControllerClearAlgorithms<T>(
  controller: ReadableStreamDefaultController<T>
) {
  controller.pullAlgorithm = void 0;
  controller.cancelAlgorithm = void 0;
  controller.strategySizeAlgorithm = void 0;
}

export function ReadableStreamDefaultControllerClose<T>(controller) {
  const stream = controller.controlledReadableStream;
  Assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller));
  controller.closeRequested = true;
  if (controller.queue.length === 0) {
    ReadableStreamDefaultControllerClearAlgorithms(controller);
    ReadableStreamClose(stream);
  }
}

export function ReadableStreamDefaultControllerEnqueue<T>(controller, chunk) {
  if (IsReadableStreamDefaultController(controller)) {
    const stream = controller.controlledReadableStream;
    Assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller));
    if (
      IsReadableStreamLocked(stream) ||
      ReadableStreamGetNumReadRequests(stream) > 0
    ) {
      ReadableStreamFulfillReadRequest(stream, chunk, false);
    } else {
      let result: number;
      try {
        result = controller.strategySizeAlgorithm(chunk);
      } catch (e) {
        ReadableStreamDefaultControllerError(controller, e);
        return e;
      }
      const chunkSize = result;
      try {
        EnqueueValueWithSize(controller, chunk, chunkSize);
      } catch (e) {
        ReadableStreamDefaultControllerError(controller, e);
        return e;
      }
      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    }
  }
}

export function ReadableStreamDefaultControllerError<T>(controller, e) {
  if (IsReadableStreamDefaultController(controller)) {
    const stream = controller.controlledReadableStream;
    if (stream.state !== "readable") {
      return;
    }
    ResetQueue(controller);
    ReadableStreamDefaultControllerClearAlgorithms(controller);
    ReadableStreamError(stream, e);
  }
}

export function ReadableStreamDefaultControllerGetDesiredSize<T>(
  controller: ReadableStreamDefaultController<T>
): number | null {
  const stream = controller.controlledReadableStream;
  const state = stream.state;
  if (state === "errored") {
    return null;
  }
  if (state === "closed") {
    return 0;
  }
  return controller.strategyHWM - controller.queueTotalSize;
}

export function ReadableStreamDefaultControllerHasBackpressure<T>(
  controller: ReadableStreamDefaultController<T>
): boolean {
  return !ReadableStreamDefaultControllerShouldCallPull(controller);
}

export function ReadableStreamDefaultControllerCanCloseOrEnqueue<T>(
  controller: ReadableStreamDefaultController<T>
): boolean {
  const state = controller.controlledReadableStream.state;
  return !controller.closeRequested && state === "readable";
}

export function SetUpReadableStreamDefaultController<T>(params: {
  stream: ReadableStream;
  controller: ReadableStreamDefaultController<T>;
  startAlgorithm: StartAlgorithm;
  pullAlgorithm: PullAlgorithm;
  cancelAlgorithm: CancelAlgorithm;
  highWaterMark: number;
  sizeAlgorithm: SizeAlgorithm;
}) {
  const {
    stream,
    controller,
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm
  } = params;
  let { highWaterMark, sizeAlgorithm } = params;
  Assert(stream.readableStreamController === void 0);
  controller.controlledReadableStream = stream;
  controller.queue = void 0;
  controller.queueTotalSize = void 0;
  ResetQueue(controller);
  controller.started = false;
  controller.closeRequested = false;
  controller.pullAgain = false;
  controller.pulling = false;
  controller.strategySizeAlgorithm = sizeAlgorithm;
  controller.strategyHWM = highWaterMark;
  controller.pullAlgorithm = pullAlgorithm;
  controller.cancelAlgorithm = cancelAlgorithm;
  stream.readableStreamController = controller;
  Promise.resolve(startAlgorithm())
    .then(() => {
      controller.started = true;
      Assert(controller.pulling == false);
      Assert(controller.pullAgain == false);
      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    })
    .catch(r => {
      ReadableStreamDefaultControllerError(controller, r);
    });
}

export function SetUpReadableStreamDefaultControllerFromUnderlyingSource(params: {
  stream: ReadableStream;
  underlyingSource: UnderlyingSource;
  highWaterMark: number;
  sizeAlgorithm: SizeAlgorithm;
}) {
  const { stream, underlyingSource, highWaterMark, sizeAlgorithm } = params;
  Assert(underlyingSource !== void 0);
  const controller = Object.create(ReadableStreamDefaultController.prototype);
  const startAlgorithm = () =>
    InvokeOrNoop(underlyingSource, "start", controller);
  const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingSource,
    "pull",
    0,
    controller
  );
  const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingSource,
    "cancel",
    1
  );
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
