import {
  CancelAlgorithm,
  IsReadableStreamLocked,
  PullAlgorithm,
  ReadableStream,
  ReadableStreamAddReadIntoRequest,
  ReadableStreamAddReadRequest,
  ReadableStreamClose,
  ReadableStreamCreateReadResult,
  ReadableStreamError,
  ReadableStreamFulfillReadIntoRequest,
  ReadableStreamFulfillReadRequest,
  ReadableStreamGetNumReadIntoRequests,
  ReadableStreamGetNumReadRequests,
  ReadableStreamHasBYOBReader,
  ReadableStreamHasDefaultReader,
  ReadableStreamReadResult,
  StartAlgorithm,
  UnderlyingSource
} from "./readable_stream.ts";
import {
  ReadableStreamBYOBRequest,
  ReadableStreamBYOBRequestImpl,
  SetUpReadableStreamBYOBRequest
} from "./readable_stream_request.ts";
import {
  CreateAlgorithmFromUnderlyingMethod,
  InvokeOrNoop,
  IsFiniteNonNegativeNumber,
  ResetQueue,
  TransferArrayBuffer,
  ValidateAndNormalizeHighWaterMark
} from "./misc.ts";
import { Assert, isArrayBufferView } from "./util.ts";
import {
  PullIntoDescriptor,
  ReadableStreamController,
  ReadableStreamControllerBase
} from "./readable_stream_controller.ts";

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
    if (!isArrayBufferView(chunk)) {
      throw new TypeError("chunk is not ArrayBufferView: " + chunk);
    }
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

export function IsReadableByteStreamController(
  x
): x is ReadableByteStreamController {
  return (
    typeof x === "object" && x.hasOwnProperty("controlledReadableByteStream")
  );
}

export function ReadableByteStreamControllerCallPullIfNeeded(
  controller: ReadableByteStreamController
) {
  const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
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
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
    })
    .catch(r => {
      ReadableByteStreamControllerError(controller, r);
    });
}

export function ReadableByteStreamControllerClearAlgorithms(
  controller: ReadableByteStreamController
) {
  controller.pullAlgorithm = void 0;
  controller.cancelAlgorithm = void 0;
}

export function ReadableByteStreamControllerClearPendingPullIntos(
  controller: ReadableByteStreamController
) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller.pendingPullIntos = [];
}

export function ReadableByteStreamControllerClose(
  controller: ReadableByteStreamController
) {
  const stream = controller.controlledReadableByteStream;
  Assert(controller.closeRequested === false);
  Assert(stream.state === "readable");
  if (controller.queueTotalSize > 0) {
    controller.closeRequested = true;
    return;
  }
  if (controller.pendingPullIntos.length > 0) {
    const firstPengingPullInfo = controller.pendingPullIntos[0];
    if (firstPengingPullInfo.bytesFilled > 0) {
      const e = new TypeError();
      ReadableByteStreamControllerError(controller, e);
      throw e;
    }
  }
  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamClose(stream);
}

export function ReadableByteStreamControllerCommitPullIntoDescriptor(
  stream: ReadableStream,
  pullIntoDescriptor: PullIntoDescriptor
) {
  Assert(stream.state !== "errored");
  let done = false;
  if (stream.state === "closed") {
    Assert(pullIntoDescriptor.bytesFilled === 0);
    done = true;
  }
  const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(
    pullIntoDescriptor
  );
  if (pullIntoDescriptor.readerType === "default") {
    ReadableStreamFulfillReadRequest(stream, filledView, done);
  } else {
    Assert(pullIntoDescriptor.readerType === "byob");
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

export function ReadableByteStreamControllerConvertPullIntoDescriptor(
  pullIntoDescriptor: PullIntoDescriptor
) {
  const { bytesFilled, elementSize } = pullIntoDescriptor;
  Assert(bytesFilled <= pullIntoDescriptor.byteLength);
  Assert(bytesFilled % pullIntoDescriptor.elementSize === 0);
  return new pullIntoDescriptor.ctor(
    pullIntoDescriptor.buffer,
    pullIntoDescriptor.byteOffset,
    bytesFilled / elementSize
  );
}

export function ReadableByteStreamControllerEnqueue(
  controller: ReadableByteStreamController,
  chunk: ArrayBufferView
) {
  const stream = controller.controlledReadableByteStream;
  Assert(controller.closeRequested === false);
  Assert(stream.state === "readable");
  const { buffer } = chunk;
  const { byteOffset, byteLength } = chunk;
  const transferredBuffer = TransferArrayBuffer(buffer);
  if (ReadableStreamHasDefaultReader(stream)) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      ReadableByteStreamControllerEnqueueChunkToQueue(
        controller,
        transferredBuffer,
        byteOffset,
        byteLength
      );
    } else {
      Assert(controller.queue.length === 0, "l=0");
      const transferredView = new Uint8Array(
        transferredBuffer,
        byteOffset,
        byteLength
      );
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream)) {
    ReadableByteStreamControllerEnqueueChunkToQueue(
      controller,
      transferredBuffer,
      byteOffset,
      byteLength
    );
    ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(
      controller
    );
  } else {
    Assert(
      IsReadableStreamLocked(stream) === false,
      "stream should not be locked"
    );
    ReadableByteStreamControllerEnqueueChunkToQueue(
      controller,
      transferredBuffer,
      byteOffset,
      byteLength
    );
  }
  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

export function ReadableByteStreamControllerEnqueueChunkToQueue(
  controller: ReadableByteStreamController,
  buffer: ArrayBuffer,
  byteOffset: number,
  byteLength: number
) {
  controller.queue.push({
    buffer,
    byteOffset,
    byteLength
  });
  controller.queueTotalSize += byteLength;
}

export function ReadableByteStreamControllerError(
  controller: ReadableByteStreamController,
  e
) {
  const stream = controller.controlledReadableByteStream;
  if (stream.state !== "readable") {
    return;
  }
  ReadableByteStreamControllerClearPendingPullIntos(controller);
  ResetQueue(controller);
  ReadableByteStreamControllerClearAlgorithms(controller);
  ReadableStreamError(controller.controlledReadableByteStream, e);
}

export function ReadableByteStreamControllerFillHeadPullIntoDescriptor(
  controller: ReadableByteStreamController,
  size: number,
  pullIntoDescriptor: PullIntoDescriptor
) {
  Assert(
    controller.pendingPullIntos.length === 0 ||
      controller.pendingPullIntos[0] === pullIntoDescriptor
  );
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  pullIntoDescriptor.bytesFilled += size;
}

export function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(
  controller: ReadableByteStreamController,
  pullIntoDescriptor: PullIntoDescriptor
): boolean {
  const { elementSize } = pullIntoDescriptor;
  const currentAlignedBytes =
    pullIntoDescriptor.bytesFilled -
    (pullIntoDescriptor.bytesFilled % elementSize);
  const maxBytesToCopy = Math.min(
    controller.queueTotalSize,
    pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled
  );
  const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  const maxAlignedBytes = maxBytesFilled - (maxBytesFilled % elementSize);
  let totalBytesToCopyRemaining = maxBytesToCopy;
  let ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining =
      maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }
  const { queue } = controller;
  while (totalBytesToCopyRemaining > 0) {
    const headOfQueue = queue[0];
    const bytesToCopy = Math.min(
      totalBytesToCopyRemaining,
      headOfQueue.byteLength
    );
    const destStart =
      pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    const srcView = new Uint8Array(
      headOfQueue.buffer,
      headOfQueue.byteOffset,
      headOfQueue.byteLength
    );
    const destView = new Uint8Array(
      pullIntoDescriptor.buffer,
      destStart,
      bytesToCopy
    );
    for (let i = 0; i < bytesToCopy; i++) {
      destView[i] = srcView[i];
    }
    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller.queueTotalSize -= bytesToCopy;
    ReadableByteStreamControllerFillHeadPullIntoDescriptor(
      controller,
      bytesToCopy,
      pullIntoDescriptor
    );
    totalBytesToCopyRemaining -= bytesToCopy;
  }
  if (ready === false) {
    Assert(controller.queueTotalSize === 0);
    Assert(pullIntoDescriptor.bytesFilled > 0);
    Assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }
  return ready;
}

export function ReadableByteStreamControllerGetDesiredSize(
  controller: ReadableByteStreamController
): number | null {
  const stream = controller.controlledReadableByteStream;
  const { state } = stream;
  if (state === "errored") {
    return null;
  }
  if (state === "closed") {
    return 0;
  }
  return controller.strategyHWM - controller.queueTotalSize;
}

export function ReadableByteStreamControllerHandleQueueDrain(
  controller: ReadableByteStreamController
) {
  Assert(controller.controlledReadableByteStream.state === "readable");
  if (controller.queueTotalSize === 0 && controller.closeRequested) {
    ReadableByteStreamControllerClearAlgorithms(controller);
    ReadableStreamClose(controller.controlledReadableByteStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

export function ReadableByteStreamControllerInvalidateBYOBRequest(
  controller: ReadableByteStreamController
) {
  if (controller._byobRequest === void 0) {
    return;
  }
  controller._byobRequest.associatedReadableByteStreamController = void 0;
  controller._byobRequest._view = void 0;
  controller._byobRequest = void 0;
}

export function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(
  controller: ReadableByteStreamController
) {
  Assert(controller.closeRequested === false);
  while (controller.pendingPullIntos.length > 0) {
    if (controller.queueTotalSize === 0) {
      return;
    }
    const pullIntoDescriptor = controller.pendingPullIntos[0];
    if (
      ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(
        controller,
        pullIntoDescriptor
      ) === true
    ) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);
      ReadableByteStreamControllerCommitPullIntoDescriptor(
        controller.controlledReadableByteStream,
        pullIntoDescriptor
      );
    }
  }
}

const TypedArraySizeMap = {
  Int8Array: [1, Int8Array],
  Uint8Array: [1, Uint8Array],
  Uint8ClampedArray: [1, Uint8ClampedArray],
  Int16Array: [2, Int16Array],
  Uint16Array: [2, Uint16Array],
  Int32Array: [4, Int32Array],
  Uint32Array: [4, Uint32Array],
  Float32Array: [4, Float32Array],
  Float64Array: [8, Float64Array]
};

export function ReadableByteStreamControllerPullInto(
  controller: ReadableByteStreamController,
  view: ArrayBufferView,
  forAuthorCode?: boolean
): Promise<any> {
  const stream = controller.controlledReadableByteStream;
  let elementSize = 1;
  let ctor = DataView;
  const ctorName = view.constructor.name;
  if (TypedArraySizeMap[ctorName]) {
    [elementSize, ctor] = TypedArraySizeMap[ctorName];
  }
  const { byteOffset, byteLength } = view;
  const buffer = TransferArrayBuffer(view.buffer);
  const pullIntoDescriptor: PullIntoDescriptor = {
    buffer,
    byteOffset,
    byteLength,
    bytesFilled: 0,
    elementSize,
    ctor,
    readerType: "byob"
  };
  if (controller.pendingPullIntos.length > 0) {
    controller.pendingPullIntos.push(pullIntoDescriptor);
    return ReadableStreamAddReadIntoRequest(stream, forAuthorCode);
  }
  if (stream.state === "closed") {
    const emptyView = new ctor(
      pullIntoDescriptor.buffer,
      pullIntoDescriptor.byteOffset,
      0
    );
    return Promise.resolve(
      ReadableStreamCreateReadResult(emptyView, true, forAuthorCode)
    );
  }
  if (controller.queueTotalSize > 0) {
    if (
      ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(
        controller,
        pullIntoDescriptor
      )
    ) {
      const filedView = ReadableByteStreamControllerConvertPullIntoDescriptor(
        pullIntoDescriptor
      );
      ReadableByteStreamControllerHandleQueueDrain(controller);
      return Promise.resolve(
        ReadableStreamCreateReadResult(filedView, false, forAuthorCode)
      );
    }
    if (controller.closeRequested) {
      const e = new TypeError();
      ReadableByteStreamControllerError(controller, e);
      return Promise.reject(e);
    }
  }
  controller.pendingPullIntos.push(pullIntoDescriptor);
  const promise = ReadableStreamAddReadIntoRequest(stream, forAuthorCode);
  ReadableByteStreamControllerCallPullIfNeeded(controller);
  return promise;
}

export function ReadableByteStreamControllerRespond(
  controller: ReadableByteStreamController,
  bytesWritten: number
): void {
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError();
  }
  Assert(controller.pendingPullIntos.length > 0);
  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

export function ReadableByteStreamControllerRespondInClosedState(
  controller: ReadableByteStreamController,
  firstDescriptor: PullIntoDescriptor
) {
  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);
  Assert(firstDescriptor.bytesFilled === 0);
  const stream = controller.controlledReadableByteStream;
  if (ReadableStreamHasBYOBReader(stream)) {
    while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
      const pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(
        controller
      );
      ReadableByteStreamControllerCommitPullIntoDescriptor(
        stream,
        pullIntoDescriptor
      );
    }
  }
}

export function ReadableByteStreamControllerRespondInReadableState(
  controller: ReadableByteStreamController,
  bytesWritten: number,
  pullIntoDescriptor: PullIntoDescriptor
) {
  if (
    pullIntoDescriptor.bytesFilled + bytesWritten >
    pullIntoDescriptor.byteLength
  ) {
    throw new RangeError();
  }
  ReadableByteStreamControllerFillHeadPullIntoDescriptor(
    controller,
    bytesWritten,
    pullIntoDescriptor
  );
  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    return;
  }
  ReadableByteStreamControllerShiftPendingPullInto(controller);
  const remainderSize =
    pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    const remainder = CloneArrayBuffer(
      pullIntoDescriptor.buffer,
      end - remainderSize,
      remainderSize
    );
    ReadableByteStreamControllerEnqueueChunkToQueue(
      controller,
      remainder,
      0,
      remainder.byteLength
    );
  }
  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled =
    pullIntoDescriptor.bytesFilled - remainderSize;
  ReadableByteStreamControllerCommitPullIntoDescriptor(
    controller.controlledReadableByteStream,
    pullIntoDescriptor
  );
  ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
}

function CloneArrayBuffer(
  srcBuffer: ArrayBuffer,
  srcByteOffset: number,
  srcLength: number
): ArrayBuffer {
  const ret = new ArrayBuffer(srcLength);
  const retView = new DataView(ret);
  const srcView = new DataView(srcBuffer, srcByteOffset, srcLength);
  for (let i = 0; i < srcLength; i++) {
    retView[i] = srcView[i];
  }
  return ret;
}

export function ReadableByteStreamControllerRespondInternal(
  controller: ReadableByteStreamController,
  bytesWritten: number
) {
  const firstDescriptor = controller.pendingPullIntos[0];
  const stream = controller.controlledReadableByteStream;
  if (stream.state === "closed") {
    if (bytesWritten !== 0) {
      throw new TypeError();
    }
    ReadableByteStreamControllerRespondInClosedState(
      controller,
      firstDescriptor
    );
  } else {
    Assert(stream.state === "readable");
    ReadableByteStreamControllerRespondInReadableState(
      controller,
      bytesWritten,
      firstDescriptor
    );
  }
  ReadableByteStreamControllerCallPullIfNeeded(controller);
}

export function ReadableByteStreamControllerRespondWithNewView(
  controller: ReadableByteStreamController,
  view
) {
  Assert(controller.pendingPullIntos.length > 0);
  const firstDescriptor = controller.pendingPullIntos[0];
  if (
    firstDescriptor.byteOffset + firstDescriptor.bytesFilled !==
    view.ByteOffset
  ) {
    throw new RangeError();
  }
  if (firstDescriptor.byteLength !== view.ByteLength) {
    throw new RangeError();
  }
  firstDescriptor.buffer = view.ViewedArrayBuffer;
  ReadableByteStreamControllerRespondInternal(controller, view.ByteLength);
}

export function ReadableByteStreamControllerShiftPendingPullInto(
  controller: ReadableByteStreamController
): PullIntoDescriptor {
  const descriptor = controller.pendingPullIntos.shift();
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  return descriptor;
}

export function ReadableByteStreamControllerShouldCallPull(
  controller: ReadableByteStreamController
) {
  const stream = controller.controlledReadableByteStream;
  if (stream.state !== "readable") {
    return false;
  }
  if (controller.closeRequested === true) {
    return false;
  }
  if (controller.started === false) {
    return false;
  }
  if (
    ReadableStreamHasDefaultReader(stream) &&
    ReadableStreamGetNumReadRequests(stream) > 0
  ) {
    return true;
  }
  if (
    ReadableStreamHasBYOBReader(stream) &&
    ReadableStreamGetNumReadIntoRequests(stream) > 0
  ) {
    return true;
  }
  const desiredSize = ReadableByteStreamControllerGetDesiredSize(controller);
  Assert(desiredSize !== null);
  if (desiredSize > 0) {
    return true;
  }
  return false;
}

export function SetUpReadableByteStreamController(
  stream: ReadableStream,
  controller: ReadableByteStreamController,
  startAlgorithm: StartAlgorithm,
  pullAlgorithm: PullAlgorithm,
  cancelAlgorithm: CancelAlgorithm,
  highWaterMark: number,
  autoAllocateChunkSize: number
) {
  Assert(stream.readableStreamController === void 0);
  if (autoAllocateChunkSize !== void 0) {
    Assert(Number.isInteger(autoAllocateChunkSize));
    Assert(autoAllocateChunkSize > 0);
  }
  controller.controlledReadableByteStream = stream;
  controller.pullAgain = false;
  controller.pulling = false;
  ReadableByteStreamControllerClearPendingPullIntos(controller);
  ResetQueue(controller);
  controller.closeRequested = false;
  controller.started = false;
  controller.strategyHWM = ValidateAndNormalizeHighWaterMark(highWaterMark);
  controller.pullAlgorithm = pullAlgorithm;
  controller.cancelAlgorithm = cancelAlgorithm;
  controller.autoAllocateChunkSize = autoAllocateChunkSize;
  controller.pendingPullIntos = [];
  stream.readableStreamController = controller;
  Promise.resolve(startAlgorithm())
    .then(() => {
      controller.started = true;
      Assert(!controller.pulling);
      Assert(!controller.pullAgain);
      ReadableByteStreamControllerCallPullIfNeeded(controller);
    })
    .catch(r => {
      ReadableByteStreamControllerError(controller, r);
    });
}

export function SetUpReadableByteStreamControllerFromUnderlyingSource<T>(
  stream: ReadableStream,
  underlyingByteSource: UnderlyingSource,
  highWaterMark: number
) {
  Assert(underlyingByteSource !== void 0);
  const controller = Object.create(ReadableByteStreamController.prototype);
  const startAlgorithm = () =>
    InvokeOrNoop(underlyingByteSource, "start", controller);
  const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingByteSource,
    "pull",
    0,
    controller
  );
  const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingByteSource,
    "cancel",
    1
  );
  const { autoAllocateChunkSize } = underlyingByteSource;
  if (autoAllocateChunkSize !== void 0) {
    if (!Number.isInteger(autoAllocateChunkSize) || autoAllocateChunkSize < 0) {
      throw new RangeError();
    }
  }
  SetUpReadableByteStreamController(
    stream,
    controller,
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm,
    highWaterMark,
    autoAllocateChunkSize
  );
}
