import { SizeAlgorithm, StartAlgorithm } from "./readable_stream.ts";
import {
  WritableStream,
  AbortAlgorithm,
  CloseAlgorithm,
  IsWritableStream,
  WriteAlgorithm,
  WritableStreamUpdateBackpressure,
  WritableStreamDealWithRejection,
  WritableStreamCloseQueuedOrInFlight,
  WritableStreamFinishErroring,
  WritableStreamMarkCloseRequestInFlight,
  WritableStreamFinishInFlightClose,
  WritableStreamFinishInFlightCloseWithError,
  WritableStreamMarkFirstWriteRequestInFlight,
  WritableStreamFinishInFlightWrite,
  WritableStreamStartErroring
} from "./writable_stream.ts";
import { Assert } from "./util.ts";
import {
  CreateAlgorithmFromUnderlyingMethod,
  DequeueValue,
  EnqueueValueWithSize,
  InvokeOrNoop,
  PeekQueueValue,
  ResetQueue
} from "./misc.ts";

export interface WritableStreamController {
  error(e);
}

export const ErrorSteps = Symbol("ErrorSteps");
export const AbortSteps = Symbol("AbortSteps");

export function createWritableStreamDefaultController<
  T
>(): WritableStreamDefaultController<T> {
  const ret = Object.create(WritableStreamDefaultController.prototype);
  ret[ErrorSteps] = () => ResetQueue(ret);
  ret[AbortSteps] = reason => {
    const result = ret.abortAlgorithm(reason);
    WritableStreamDefaultControllerClearAlgorithms(ret);
    return result;
  };
  return ret;
}

export class WritableStreamDefaultController<T>
  implements WritableStreamController {
  abortAlgorithm: AbortAlgorithm;
  closeAlgorithm: CloseAlgorithm;
  controlledWritableStream: WritableStream;
  queue: ("close" | { chunk: T })[];
  queueTotalSize: number;
  started: boolean;
  strategyHWM: number;
  strategySizeAlgorithm: SizeAlgorithm;
  writeAlgorithm: WriteAlgorithm<T>;

  constructor() {
    throw new TypeError();
  }

  error(e) {
    if (!IsWritableStreamDefaultController(this)) {
      throw new TypeError("this is not WritableStreamDefaultController");
    }
    const { state } = this.controlledWritableStream;
    if (state !== "writable") {
      return;
    }
    WritableStreamDefaultControllerError(this, e);
  }
}

export function IsWritableStreamDefaultController<T>(
  x
): x is WritableStreamDefaultController<T> {
  return typeof x === "object" && x.hasOwnProperty("controlledWritableStream");
}

export function SetUpWritableStreamDefaultController<T>(params: {
  stream: WritableStream;
  controller: WritableStreamDefaultController<T>;
  startAlgorithm: StartAlgorithm;
  writeAlgorithm: WriteAlgorithm<T>;
  closeAlgorithm: CloseAlgorithm;
  abortAlgorithm: AbortAlgorithm;
  highWaterMark: number;
  sizeAlgorithm: SizeAlgorithm;
}) {
  const {
    stream,
    controller,
    startAlgorithm,
    writeAlgorithm,
    closeAlgorithm,
    abortAlgorithm,
    highWaterMark,
    sizeAlgorithm
  } = params;
  Assert(IsWritableStream(stream));
  Assert(stream.writableStreamController === void 0);
  controller.controlledWritableStream = stream;
  stream.writableStreamController = controller;
  ResetQueue(controller);
  controller.started = false;
  controller.strategySizeAlgorithm = sizeAlgorithm;
  controller.strategyHWM = highWaterMark;
  controller.writeAlgorithm = writeAlgorithm;
  controller.closeAlgorithm = closeAlgorithm;
  controller.abortAlgorithm = abortAlgorithm;
  const backpressure = WritableStreamDefaultControllerGetBackpressure(
    controller
  );
  WritableStreamUpdateBackpressure(stream, backpressure);
  Promise.resolve(startAlgorithm())
    .then(() => {
      Assert(stream.state === "writable" || stream.state === "erroring");
      controller.started = true;
      WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
    })
    .catch(r => {
      Assert(stream.state === "writable" || stream.state === "erroring");
      controller.started = true;
      WritableStreamDealWithRejection(stream, r);
    });
}

export function SetUpWritableStreamDefaultControllerFromUnderlyingSink(
  stream: WritableStream,
  underlyingSink,
  highWaterMark: number,
  sizeAlgorithm: SizeAlgorithm
) {
  Assert(underlyingSink !== void 0);
  const controller = createWritableStreamDefaultController();
  const startAlgorithm = () =>
    InvokeOrNoop(underlyingSink, "start", controller);
  const writeAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingSink,
    "write",
    1,
    controller
  );
  const closeAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingSink,
    "close",
    0
  );
  const abortAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    underlyingSink,
    "abort",
    1
  );
  SetUpWritableStreamDefaultController({
    stream,
    controller,
    startAlgorithm,
    writeAlgorithm,
    closeAlgorithm,
    abortAlgorithm,
    highWaterMark,
    sizeAlgorithm
  });
}

export function WritableStreamDefaultControllerClearAlgorithms<T>(
  controller: WritableStreamDefaultController<T>
) {
  controller.writeAlgorithm = void 0;
  controller.closeAlgorithm = void 0;
  controller.abortAlgorithm = void 0;
  controller.strategySizeAlgorithm = void 0;
}

export function WritableStreamDefaultControllerClose<T>(
  controller: WritableStreamDefaultController<T>
) {
  EnqueueValueWithSize(controller, "close", 0);
  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

export function WritableStreamDefaultControllerGetChunkSize<T>(
  controller: WritableStreamDefaultController<T>,
  chunk
): number {
  try {
    return controller.strategySizeAlgorithm(chunk);
  } catch (e) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, e);
    return 1;
  }
}

export function WritableStreamDefaultControllerGetDesiredSize<T>(
  controller: WritableStreamDefaultController<T>
): number {
  return controller.strategyHWM - controller.queueTotalSize;
}

export function WritableStreamDefaultControllerWrite<T>(
  controller: WritableStreamDefaultController<T>,
  chunk,
  chunkSize: number
) {
  const writeRecord = { chunk };
  try {
    EnqueueValueWithSize(controller, writeRecord, chunkSize);
  } catch (e) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, e);
    return;
  }
  const stream = controller.controlledWritableStream;
  if (
    !WritableStreamCloseQueuedOrInFlight(stream) &&
    stream.state === "writable"
  ) {
    const backpressure = WritableStreamDefaultControllerGetBackpressure(
      controller
    );
    WritableStreamUpdateBackpressure(stream, backpressure);
  }
  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

export function WritableStreamDefaultControllerAdvanceQueueIfNeeded<T>(
  controller: WritableStreamDefaultController<T>
) {
  const stream = controller.controlledWritableStream;
  if (!controller.started) {
    return;
  }
  if (stream.inFlightWriteRequest !== void 0) {
    return;
  }
  const { state } = stream;
  if (state === "closed" || state === "errored") {
    return;
  }
  if (state === "erroring") {
    WritableStreamFinishErroring(stream);
    return;
  }
  if (controller.queue.length === 0) {
    return;
  }
  const writeRecord = PeekQueueValue(controller);
  if (writeRecord === "close") {
    WritableStreamDefaultControllerProcessClose(controller);
  } else {
    WritableStreamDefaultControllerProcessWrite(controller, writeRecord.chunk);
  }
}

export function WritableStreamDefaultControllerErrorIfNeeded<T>(
  controller: WritableStreamDefaultController<T>,
  error
) {
  if (controller.controlledWritableStream.state === "writable") {
    WritableStreamDefaultControllerError(controller, error);
  }
}

export function WritableStreamDefaultControllerProcessClose<T>(
  controller: WritableStreamDefaultController<T>
) {
  const stream = controller.controlledWritableStream;
  WritableStreamMarkCloseRequestInFlight(stream);
  DequeueValue(controller);
  Assert(controller.queue.length === 0);
  const sinkClosePromise = controller.closeAlgorithm();
  WritableStreamDefaultControllerClearAlgorithms(controller);
  sinkClosePromise
    .then(() => {
      WritableStreamFinishInFlightClose(stream);
    })
    .catch(r => {
      WritableStreamFinishInFlightCloseWithError(stream, r);
    });
}

export function WritableStreamDefaultControllerProcessWrite<T>(
  controller: WritableStreamDefaultController<T>,
  chunk
) {
  const stream = controller.controlledWritableStream;
  WritableStreamMarkFirstWriteRequestInFlight(stream);
  const sinkWritePromise = controller.writeAlgorithm(chunk);
  sinkWritePromise.then(() => {
    WritableStreamFinishInFlightWrite(stream);
    const { state } = stream;
    Assert(state === "writable" || state === "erroring");
    DequeueValue(controller);
    if (!WritableStreamCloseQueuedOrInFlight(stream) && state === "writable") {
      const bp = WritableStreamDefaultControllerGetBackpressure(controller);
      WritableStreamUpdateBackpressure(stream, bp);
    }
    WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
  });
}

export function WritableStreamDefaultControllerGetBackpressure<T>(
  controller: WritableStreamDefaultController<T>
) {
  return WritableStreamDefaultControllerGetDesiredSize(controller) <= 0;
}

export function WritableStreamDefaultControllerError<T>(
  controller: WritableStreamDefaultController<T>,
  error
) {
  const stream = controller.controlledWritableStream;
  Assert(stream.state === "writable");
  WritableStreamDefaultControllerClearAlgorithms(controller);
  WritableStreamStartErroring(stream, error);
}
