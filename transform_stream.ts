import {
  SizeAlgorithm,
  StartAlgorithm,
  ReadableStream,
  CreateReadableStream
} from "./readable_stream.ts";
import { defer, Defer } from "./defer.ts";
import { CreateWritableStream, WritableStream } from "./writable_stream.ts";
import { QueuingStrategy } from "./strategy.ts";
import {
  InvokeOrNoop,
  IsNonNegativeNumber,
  MakeSizeAlgorithmFromSizeFunction,
  ValidateAndNormalizeHighWaterMark
} from "./misc.ts";
import {
  SetUpTransformStreamDefaultController,
  SetUpTransformStreamDefaultControllerFromTransformer,
  TransformStreamController,
  TransformStreamDefaultController,
  TransformStreamDefaultControllerClearAlgorithms,
  TransformStreamDefaultSinkAbortAlgorithm,
  TransformStreamDefaultSinkCloseAlgorithm,
  TransformStreamDefaultSinkWriteAlgorithm,
  TransformStreamDefaultSourcePullAlgorithm
} from "./transform_stream_controller";
import { Assert } from "./util";
import { ReadableStreamDefaultControllerError } from "./readable_stream_controller";
import { WritableStreamDefaultControllerErrorIfNeeded } from "./writable_stream_controller";

export type Transformer<T> = {
  start?: (controller) => any;
  transform?: (chunk, controller: TransformStreamController<T>) => Promise<any>;
  flush?: (controller: TransformStreamController<T>) => Promise<any>;
  writableType?: undefined;
  readableType?: undefined;
};

export class TransformStream<T = any> {
  constructor(
    transformer: Transformer<T>,
    writableStrategy: QueuingStrategy,
    readableStrategy: QueuingStrategy
  ) {
    let writableSizeFunction = writableStrategy.size;
    let writableHighWaterMark = writableStrategy.highWaterMark;
    let readableSizeFunction = readableStrategy.size;
    let readableHighWaterMark = readableStrategy.highWaterMark;
    const { writableType } = transformer;
    if (writableType !== void 0) {
      throw new RangeError("writable type should not be defined");
    }
    writableSizeFunction = MakeSizeAlgorithmFromSizeFunction(
      writableSizeFunction
    );
    writableHighWaterMark = ValidateAndNormalizeHighWaterMark(
      writableHighWaterMark
    );
    const { readableType } = transformer;
    if (readableType !== void 0) {
      throw new RangeError("readable type should not be defined");
    }
    readableSizeFunction = MakeSizeAlgorithmFromSizeFunction(
      readableSizeFunction
    );
    readableHighWaterMark = ValidateAndNormalizeHighWaterMark(
      readableHighWaterMark
    );
    const startPromise = defer();
    InitializeTransformStream(
      this,
      startPromise,
      writableHighWaterMark,
      writableSizeFunction,
      readableHighWaterMark,
      readableSizeFunction
    );
    SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);
    startPromise.resolve(
      InvokeOrNoop(transformer, "start", this.transformStreamController)
    );
  }

  get readable(): ReadableStream<T> {
    if (!IsTransformStream(this)) {
      throw new TypeError("this is not transform stream");
    }
    return this._readable;
  }

  get writable(): WritableStream<T> {
    if (!IsTransformStream(this)) {
      throw new TypeError("this is not transform stream");
    }
    return this._writable;
  }

  backpressure: boolean;
  backpressureChangePromise: Defer<any>;
  _readable: ReadableStream<T>;
  transformStreamController: TransformStreamDefaultController<T>;
  _writable: WritableStream<T>;
}

export type FlushAlgorithm = () => Promise<any>;
export type TransformAlgorithm<T> = (chunk: T) => Promise<any>;

export function CreateTransformStream<T>(
  startAlgorithm: StartAlgorithm,
  transformAlgorithm: TransformAlgorithm<T>,
  flushAlgorithm: FlushAlgorithm,
  writableHighWaterMark: number = 1,
  writableSizeAlgorithm: SizeAlgorithm = () => 1,
  readableHighWaterMark: number = 1,
  readableSizeAlgorithm: SizeAlgorithm = () => 1
): TransformStream {
  Assert(IsNonNegativeNumber(writableHighWaterMark));
  Assert(IsNonNegativeNumber(readableHighWaterMark));
  const stream = Object.create(TransformStream.prototype);
  const startPromise = defer();
  InitializeTransformStream(
    stream,
    startPromise,
    writableHighWaterMark,
    writableSizeAlgorithm,
    readableHighWaterMark,
    readableSizeAlgorithm
  );
  const controller = Object.create(TransformStreamDefaultController.prototype);
  SetUpTransformStreamDefaultController(
    stream,
    controller,
    transformAlgorithm,
    flushAlgorithm
  );
  startPromise.resolve(startPromise());
  return stream;
}

export function InitializeTransformStream<T>(
  stream: TransformStream<T>,
  startPromise: Defer<any>,
  writableHighWaterMark: number,
  writableSizeAlgorithm: SizeAlgorithm,
  readableHighWaterMark: number,
  readableSizeAlgorithm: SizeAlgorithm
) {
  const startAlgorithm = () => startPromise;
  const writeAlgorithm = chunk =>
    TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
  const abortAlgorithm = reason =>
    TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
  const closeAlgorithm = () => TransformStreamDefaultSinkCloseAlgorithm(stream);
  stream._writable = CreateWritableStream(
    startAlgorithm,
    writeAlgorithm,
    closeAlgorithm,
    abortAlgorithm,
    writableHighWaterMark,
    writableSizeAlgorithm
  );
  const pullAlgorithm = () => TransformStreamDefaultSourcePullAlgorithm(stream);
  const cancelAlgorithm = reason =>
    TransformStreamErrorWritableAndUnblockWrite(stream, reason);
  stream._readable = CreateReadableStream(
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm,
    readableHighWaterMark,
    readableSizeAlgorithm
  );
  stream.backpressure = void 0;
  stream.backpressureChangePromise = void 0;
  TransformStreamSetBackpressure(stream, true);
  stream.transformStreamController = void 0;
}

export function IsTransformStream(x): x is TransformStream {
  return typeof x === "object" && x.hasOwnProperty("transformStreamController");
}

export function TransformStreamError(stream: TransformStream, e) {
  ReadableStreamDefaultControllerError(
    stream.readable.readableStreamController,
    e
  );
  TransformStreamErrorWritableAndUnblockWrite(stream, e);
}

export function TransformStreamErrorWritableAndUnblockWrite(
  stream: TransformStream,
  e
) {
  TransformStreamDefaultControllerClearAlgorithms(
    stream.transformStreamController
  );
  WritableStreamDefaultControllerErrorIfNeeded(
    stream.writable.writableStreamController,
    e
  );
  if (stream.backpressure) {
    TransformStreamSetBackpressure(stream, false);
  }
}

export function TransformStreamSetBackpressure(
  stream: TransformStream,
  backpressure: boolean
) {
  Assert(stream.backpressure !== backpressure);
  if (stream.backpressureChangePromise !== void 0) {
    stream.backpressureChangePromise.resolve();
  }
  stream.backpressureChangePromise = defer();
  stream.backpressure = backpressure;
}
