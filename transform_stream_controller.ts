import {
  ReadableStreamDefaultControllerCanCloseOrEnqueue,
  ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerGetDesiredSize,
  ReadableStreamDefaultControllerHasBackpressure
} from "./readable_stream_controller";
import {
  FlushAlgorithm,
  IsTransformStream,
  TransformAlgorithm,
  Transformer,
  TransformStream,
  TransformStreamError,
  TransformStreamErrorWritableAndUnblockWrite,
  TransformStreamSetBackpressure
} from "./transform_stream";
import { Assert } from "./util";
import { CreateAlgorithmFromUnderlyingMethod, PromiseCall } from "./misc";
import { read, write } from "deno";

export interface TransformStreamController<T> {
  readonly desiredSize: number;

  enqueue(chunk: T);

  error(reason);

  terminate();
}

export class TransformStreamDefaultController<T = any>
  implements TransformStreamController<T> {
  constructor() {
    throw new TypeError(
      "TransformStreamDefaultController is not constructable"
    );
  }

  get desiredSize() {
    if (!IsTransformStreamDefaultController(this)) {
      throw new TypeError("this is not TransformStreamDefaultController");
    }
    return ReadableStreamDefaultControllerGetDesiredSize(
      this.controlledTransformStream.readable.readableStreamController
    );
  }

  enqueue(chunk: T) {
    if (!IsTransformStreamDefaultController(this)) {
      throw new TypeError("this is not TransformStreamDefaultController");
    }
    TransformStreamDefaultControllerEnqueue(this, chunk);
  }

  error(reason) {
    if (!IsTransformStreamDefaultController(this)) {
      throw new TypeError("this is not TransformStreamDefaultController");
    }
    TransformStreamDefaultControllerError(this, reason);
  }

  terminate() {
    if (!IsTransformStreamDefaultController(this)) {
      throw new TypeError("this is not TransformStreamDefaultController");
    }
    TransformStreamDefaultControllerTerminate(this);
  }

  controlledTransformStream: TransformStream<T>;
  flushAlgorithm: FlushAlgorithm;
  transformAlgorithm: TransformAlgorithm<T>;
}

export function IsTransformStreamDefaultController(
  x
): x is TransformStreamDefaultController {
  return typeof x === "object" && x.hasOwnProperty("controlledTransformStream");
}

export function SetUpTransformStreamDefaultController<T>(
  stream: TransformStream<T>,
  controller: TransformStreamDefaultController,
  transformAlgorithm: TransformAlgorithm<T>,
  flushAlgorithm: FlushAlgorithm
) {
  Assert(IsTransformStream(stream));
  Assert(stream.transformStreamController === void 0);
  controller.controlledTransformStream = stream;
  stream.transformStreamController = controller;
  controller.transformAlgorithm = transformAlgorithm;
  controller.flushAlgorithm = flushAlgorithm;
}

export function SetUpTransformStreamDefaultControllerFromTransformer<T>(
  stream: TransformStream<T>,
  transformer: Transformer<T>
) {
  Assert(transformer !== void 0);
  const controller = Object.create(TransformStreamDefaultController.prototype);
  let transformAlgorithm: TransformAlgorithm<T> = async chunk => {
    try {
      TransformStreamDefaultControllerEnqueue(controller, chunk);
    } catch (e) {
      throw void 0;
    }
    return;
  };
  const method = transformer.transform;
  if (method !== void 0) {
    if (typeof method.call !== "function") {
      throw new TypeError("transformer.transform is not callable");
    }
    transformAlgorithm = async chunk =>
      PromiseCall(method, transformer, chunk, controller);
  }
  const flushAlgorithm = CreateAlgorithmFromUnderlyingMethod(
    transformer,
    "flush",
    0,
    controller
  );
  SetUpTransformStreamDefaultController<T>(
    stream,
    controller,
    transformAlgorithm,
    flushAlgorithm
  );
}

export function TransformStreamDefaultControllerClearAlgorithms(
  controller: TransformStreamDefaultController
) {
  controller.transformAlgorithm = void 0;
  controller.flushAlgorithm = void 0;
}

export function TransformStreamDefaultControllerEnqueue(
  controller: TransformStreamDefaultController,
  chunk
) {
  const stream = controller.controlledTransformStream;
  const readableController = stream.readable.readableStreamController;
  if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)) {
    throw new TypeError("readable stream controller cannot close on enqueue");
  }
  try {
    ReadableStreamDefaultControllerEnqueue(readableController, chunk);
  } catch (e) {
    TransformStreamErrorWritableAndUnblockWrite(stream, e);
    throw stream.readable.storedError;
  }
  const backpressure = ReadableStreamDefaultControllerHasBackpressure(
    readableController
  );
  if (backpressure !== stream.backpressure) {
    Assert(backpressure);
    TransformStreamSetBackpressure(stream, true);
  }
}

export function TransformStreamDefaultControllerError(
  controller: TransformStreamDefaultController,
  e
) {
  TransformStreamError(controller.controlledTransformStream, e);
}

export function TransformStreamDefaultControllerPerformTransform(
  controller: TransformStreamDefaultController,
  chunk
) {
  controller.transformAlgorithm(chunk).catch(r => {
    TransformStreamError(controller.controlledTransformStream, r);
    throw r;
  });
}

export function TransformStreamDefaultControllerTerminate(
  controller: TransformStreamDefaultController
) {
  const stream = controller.controlledTransformStream;
  const readableController = stream.readable.readableStreamController;
  if (ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)) {
    ReadableStreamDefaultControllerClose(readableController);
  }
  const error = new TypeError("stream ended");
  TransformStreamErrorWritableAndUnblockWrite(stream, error);
}

export function TransformStreamDefaultSinkWriteAlgorithm(
  stream: TransformStream,
  chunk
) {
  Assert(stream.writable.state === "writable");
  const controller = stream.transformStreamController;
  if (stream.backpressure) {
    const p = stream.backpressureChangePromise;
    Assert(p !== void 0);
    return p.then(() => {
      const writable = stream.writable;
      const { state } = writable;
      if (state === "erroring") {
        throw writable.storedError;
      }
      Assert(state === "writable");
      return TransformStreamDefaultControllerPerformTransform(
        controller,
        chunk
      );
    });
  }
  return TransformStreamDefaultControllerPerformTransform(controller, chunk);
}

export async function TransformStreamDefaultSinkAbortAlgorithm(
  stream: TransformStream,
  reason
) {
  TransformStreamError(stream, reason);
}

export function TransformStreamDefaultSinkCloseAlgorithm(
  stream: TransformStream
) {
  const { readable } = stream;
  const controller = stream.transformStreamController;
  const flushPromise = controller.flushAlgorithm();
  TransformStreamDefaultControllerClearAlgorithms(controller);
  return flushPromise
    .then(() => {
      if (readable.state === "errored") {
        throw readable.storedError;
      }
      const readableController = readable.readableStreamController;
      if (
        ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)
      ) {
        ReadableStreamDefaultControllerClose(readableController);
      }
    })
    .catch(r => {
      TransformStreamError(stream, r);
      throw readable.storedError;
    });
}

export function TransformStreamDefaultSourcePullAlgorithm(
  stream: TransformStream
) {
  Assert(stream.backpressure);
  Assert(stream.backpressureChangePromise !== void 0);
  TransformStreamSetBackpressure(stream, false);
  return stream.backpressureChangePromise;
}
