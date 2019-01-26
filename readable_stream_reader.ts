import {
    IsReadableStream,
    IsReadableStreamLocked,
    ReadableStream,
    ReadableStreamCancel,
    ReadableStreamCreateReadResult,
    UnderlyingSource
} from "./readable_stream.ts";
import {ReadableByteStreamController} from "./readable_stream_controller";
import {defer, Defer, rejectDefer} from "./defer";
import {Assert} from "./util";
import {
    CreateAlgorithmFromUnderlyingMethod,
    InvokeOrNoop,
    ResetQueue,
    ValidateAndNormalizeHighWaterMark
} from "./queue";

interface ReadableStreamReader {
    readonly closed: Promise<undefined>

    cancel(reason): Promise<undefined>

    read(view: Uint8Array)

    releaseLock()

    closedPromise: Promise<undefined>
    ownerReadableStream: ReadableStream
}

export class ReadableStreamBYOBReader implements ReadableStreamReader {
    readIntoRequests: {promise: Defer<any>, forAuthorCode: boolean}[];

    constructor(stream: ReadableStream) {
        if (!IsReadableStream(stream)) {
            throw new TypeError()
        }
        if (IsReadableStreamLocked(stream)) {
            throw new TypeError()
        }
        ReadableStreamReaderGenericInitialize(this, stream);
        this.readIntoRequests = [];
    }
    get closed(): Promise<undefined> {
        if (!IsReadableStreamDefaultReader(this)) {
            return Promise.reject(new TypeError())
        }
        return this.closedPromise
    }

    closedPromise: Defer<undefined>;
    ownerReadableStream: ReadableStream;

    cancel(reason): Promise<undefined> {
        if (!IsReadableStreamDefaultReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        return ReadableStreamReaderGenericCancel(this, reason);
    }

    read(view: Uint8Array) {
        if (!IsReadableStreamDefaultReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        return ReadableStreamDefaultReaderRead(this, true);
    }

    releaseLock() {
        if (!IsReadableStreamDefaultReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        if (this.readIntoRequests.length > 0) {
            throw new TypeError()
        }
        ReadableStreamReaderGenericRelease(this)
    }

}

export class ReadableStreamDefaultReader implements ReadableStreamReader {
    readRequests: {promise: Defer<any>, forAuthorCode}[];

    constructor(stream: ReadableStream) {
        if (!IsReadableStream(stream)) {
            throw new TypeError()
        }
        if (!IsReadableByteStreamController(stream.readableStreamController)) {
            throw new TypeError()
        }
        if (IsReadableStreamLocked(stream)) {
            throw new TypeError()
        }
        ReadableStreamReaderGenericInitialize(this, stream);
        this.readRequests = [];
    }

    get closed(): Promise<undefined> {
        if (!IsReadableStreamBYOBReader(this)) {
            return Promise.reject(new TypeError())
        }
        return this.closedPromise
    }

    closedPromise: Defer<undefined>;
    ownerReadableStream: ReadableStream;

    cancel(reason): Promise<undefined> {
        if (!IsReadableStreamBYOBReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        return ReadableStreamReaderGenericCancel(this, reason);
    }

    read(view): Promise<any> {
        if (!IsReadableStreamBYOBReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        if (typeof view !== "object") {
            return Promise.reject(new TypeError());
        }
        if (!view.hasOwnProperty("ViewedArrayBuffer")) {
            return Promise.reject(new TypeError())
        }
        if (view["ViewArrayBuffer"].hasOwnProperty("ArrayBufferData") && view.ViewedArrayBuffer["ArrayBufferData"] === null) {
            return Promise.reject(new TypeError());
        }
        if (view["ByteLength"] === 0) {
            return Promise.reject(new TypeError());
        }
        return ReadableStreamBYOBReaderRead(this, view, true);
    }

    releaseLock() {
        if (!IsReadableStreamBYOBReader(this)) {
            return Promise.reject(new TypeError())
        }
        if (this.ownerReadableStream === void 0) {
            return Promise.reject(new TypeError())
        }
        if (this.readIntoRequests.length > 0) {
            throw new TypeError()
        }
        ReadableStreamReaderGenericRelease(this)
    }
}

export function IsReadableStreamDefaultReader(a): a is ReadableStreamDefaultReader {
    return typeof a === "object" && a.hasOwnProperty("readRequests")
}

export function IsReadableStreamBYOBReader(a): a is ReadableStreamBYOBReader {
    return typeof a === "object" && a.hasOwnProperty("readIntoRequests")
}

export function ReadableStreamReaderGenericCancel(reader: ReadableStreamReader, reason) {
    const stream = reader.ownerReadableStream;
    Assert(stream !== void 0);
    return ReadableStreamCancel(stream, reason);
}

export function ReadableStreamReaderGenericInitialize(reader: ReadableStreamBYOBReader|ReadableStreamDefaultReader, stream: ReadableStream) {
    reader.ownerReadableStream = stream;
    stream.reader = reader;
    if (stream.state === "readable") {
        reader.closedPromise = defer();
    } else if(stream.state === "closed") {
        reader.closedPromise = defer();
        reader.closedPromise.resolve(void 0);
    } else {
        Assert(stream.state === "errored");
        reader.closedPromise = defer();
        reader.closedPromise.reject(stream.storedError);
    }
}

export function ReadableStreamReaderGenericRelease(reader: ReadableStreamBYOBReader|ReadableStreamDefaultReader) {
    Assert(reader.ownerReadableStream !== void 0);
    Assert(reader.ownerReadableStream.reader === reader);
    if (reader.ownerReadableStream.state === "readable") {
        reader.closedPromise.reject(new TypeError())
    } else {
        reader.closedPromise = rejectDefer(new TypeError())
    }
    reader.ownerReadableStream.reader = void 0;
    reader.ownerReadableStream = 0
}

export async function ReadableStreamBYOBReaderRead(reader: ReadableStreamBYOBReader, view, forAuthorCode?: boolean){
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
    return ReadableByteStreamControllerPullInto(stream.readableStreamController, view, forAuthorCode);
}

export async function ReadableStreamDefaultReaderRead(reader: ReadableStreamDefaultReader, forAuthorCode?: boolean) {
    if (forAuthorCode === void 0) {
        forAuthorCode = false;
    }
    const stream = reader.ownerReadableStream;
    Assert(stream !== void 0);
    stream.disturbed = true;
    if (stream.state === "closed") {
        return Promise.resolve(ReadableStreamCreateReadResult(void 0, true, forAuthorCode));
    }
    if (stream.state === "errored") {
        return Promise.reject(stream.storedError);
    }
    Assert(stream.state === "readable");
    return stream.readableStreamController.pullAlgorithm(forAuthorCode);
}

export function IsReadableStreamDefaultController(x) {
}

export function ReadableStreamDefaultControllerCallPullIfNeeded(controller) {
}

export function ReadableStreamDefaultControllerShouldCallPull(controller) {
}

export function ReadableStreamDefaultControllerClearAlgorithms(controller) {
}

export function ReadableStreamDefaultControllerClose(controller) {
}

export function ReadableStreamDefaultControllerEnqueue(controller, chunk) {
}

export function ReadableStreamDefaultControllerError(controller, e) {
}

export function ReadableStreamDefaultControllerGetDesiredSize(controller) {
}

export function ReadableStreamDefaultControllerHasBackpressure(controller) {
}

export function ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) {
}

export function SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm) {
}

export function SetUpReadableStreamDefaultControllerFromUnderlyingSource(stream, underlyingSource, highWaterMark, sizeAlgorithm) {
}

export function IsReadableStreamBYOBRequest(x) {
}

export function IsReadableByteStreamController(x) {
}

export function ReadableByteStreamControllerCallPullIfNeeded(controller) {
}

export function ReadableByteStreamControllerClearAlgorithms(controller) {
}

export function ReadableByteStreamControllerClearPendingPullIntos(controller) {
}

export function ReadableByteStreamControllerClose(controller) {
}

export function ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor) {
}

export function ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
}

export function ReadableByteStreamControllerEnqueue(controller, chunk) {
}

export function ReadableByteStreamControllerEnqueueChunkToQueue(controller, buffer, byteOffset, byteLength) {
}

export function ReadableByteStreamControllerError(controller, e) {
}

export function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, size, pullIntoDescriptor) {
}

export function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
}

export function ReadableByteStreamControllerGetDesiredSize(controller) {
}

export function ReadableByteStreamControllerHandleQueueDrain(controller) {
}

export function ReadableByteStreamControllerInvalidateBYOBRequest(controller) {
}

export function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
}

export function ReadableByteStreamControllerPullInto(controller, view, forAuthorCode) {
}

export function ReadableByteStreamControllerRespond(controller, bytesWritten) {
}

export function ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
}

export function ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, pullIntoDescriptor) {
}

export function ReadableByteStreamControllerRespondInternal(controller, bytesWritten) {
}

export function ReadableByteStreamControllerRespondWithNewView(controller, view) {
}

export function ReadableByteStreamControllerShiftPendingPullInto(controller) {
}

export function ReadableByteStreamControllerShouldCallPull(controller) {
}

export function SetUpReadableByteStreamController(params: {
    stream: ReadableStream,
    controller: ReadableByteStreamController,
    startAlgorithm,
    pullAlgorithm,
    cancelAlgorithm,
    highWaterMark,
    autoAllocateChunkSize
}) {
    const {stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize} = params;
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
    controller.cancelAlgorithm = cancelAlgorithm;
    controller.autoAllocateChunkSize = autoAllocateChunkSize;
    controller.pendingPullIntos = [];
    stream.readableStreamController = controller;
    startAlgorithm().then(() => {
        controller.started = true;
        Assert(!controller.pulling);
        Assert(!controller.pullAgain);
        ReadableByteStreamControllerCallPullIfNeeded(controller)
    }).catch(r => {
        ReadableByteStreamControllerError(controller, r)
    })
}

export function SetUpReadableByteStreamControllerFromUnderlyingSource(
    stream: ReadableStream,
    underlyingByteSource: UnderlyingSource,
    highWaterMark: number) {
    Assert(underlyingByteSource !== void 0)
    const controller = new ReadableByteStreamController();
    const startAlgorithm = () => InvokeOrNoop(underlyingByteSource, "start", controller);
    const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingByteSource, "pull", 0, controller);
    const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingByteSource, "cancel", 1);
    const {autoAllocateChunkSize} = underlyingByteSource;
    if (autoAllocateChunkSize !== void 0) {
        if (!Number.isInteger(autoAllocateChunkSize) || autoAllocateChunkSize < 0) {
            throw new RangeError()
        }
    }
    SetUpReadableByteStreamController({stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize})
}

export function SetUpReadableStreamBYOBRequest(request, controller, view) {
}