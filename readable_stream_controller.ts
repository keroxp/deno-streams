import {Assert} from "./util";
import {
    IsReadableStreamBYOBReader,
    SetUpReadableByteStreamController
} from "./readable_stream_reader";
import {ReadableStreamBYOBRequest} from "./readable_stream_request";
import {
    IsReadableStreamLocked,
    ReadableStream,
    ReadableStreamClose,
    ReadableStreamError,
    ReadableStreamFulfillReadRequest,
    ReadableStreamGetNumReadRequests,
    UnderlyingSource
} from "./readable_stream";
import {CreateAlgorithmFromUnderlyingMethod, InvokeOrNoop, ResetQueue} from "./queue";

interface ReadableStreamControllerIface {
    readonly byobRequest: ReadableStreamBYOBRequest
    readonly desiredSize: number

    close()

    enqueue(chunk)

    error(e)
}

interface ReadableByteStreamControllerIface extends ReadableStreamControllerIface {
}

interface ReadableStreamDefaultControllerIface extends ReadableStreamControllerIface {
}

abstract class ReadableStreamControllerBase implements ReadableStreamControllerIface {
    get byobRequest(): ReadableStreamBYOBRequest {
        return this._byobRequest;
    }

    private _byobRequest: ReadableStreamBYOBRequest;

    get desiredSize() {
        return null
    }

    close() {
    }

    enqueue(chunk) {
    }

    error(e) {
    }

    autoAllocateChunkSize: number;

    cancelAlgorithm: (reason) => Promise<void>;

    closeRequested: boolean;
    pullAgain: boolean;

    pullAlgorithm: (forAuthorCode?: boolean) => Promise<void>;

    pulling: boolean;
    pendingPullIntos: [];
    queue: [];
    queueTotalSize;
    started: boolean;
    strategyHWM: number

    //
}

export class ReadableByteStreamController extends ReadableStreamControllerBase {
    controlledReadableByteStream: ReadableStream
}

export class ReadableStreamDefaultController extends ReadableByteStreamController {
    controlledReadableStream: ReadableStream;
    strategySizeAlgorithm: (chunk) => number
}

export function ReadableStreamDefaultControllerCallPullIfNeeded(controller: ReadableStreamDefaultController) {
    const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
    if (!shouldPull) {
        return
    }
    if(controller.pulling) {
        controller.pullAgain = true;
        return;
    }
    Assert(!controller.pullAgain);
    controller.pulling = true;
    controller.pullAlgorithm().then(() => {
        controller.pulling = false;
        if (controller.pullAgain) {
            controller.pullAgain = false;
            ReadableStreamDefaultControllerCallPullIfNeeded(controller)
        }
    }).catch(r => {
        ReadableStreamDefaultControllerError(controller, r)
    })
}


export function ReadableStreamDefaultControllerShouldCallPull(controller: ReadableStreamDefaultController) {
    const stream = controller.controlledReadableStream;
    if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
        return false;
    }
    if (!controller.started) {
        return false;
    }
    if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
        return true;
    }
    const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
    Assert(desiredSize !== null);
    return desiredSize > 0
}

export function ReadableStreamDefaultControllerClearAlgorithms(controller: ReadableStreamDefaultController) {
    controller.pullAlgorithm = void 0;
    controller.cancelAlgorithm = void 0;
    controller.strategySizeAlgorithm = void 0;
}

export function ReadableStreamDefaultControllerClose(controller: ReadableStreamDefaultController) {
    const stream = controller.controlledReadableStream;
    Assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller));
    controller.closeRequested = true;
    if (controller.queue.length === 0) {
        ReadableStreamDefaultControllerClearAlgorithms(controller);
        ReadableStreamClose(stream)
    }
}

export function ReadableStreamDefaultControllerEnqueue(controller: ReadableStreamDefaultController, chunk) {
    const stream = controller.controlledReadableStream;
    Assert(ReadableStreamDefaultControllerCanCloseOrEnqueue(controller));
    if (IsReadableStreamLocked(stream) || ReadableStreamGetNumReadRequests(stream) > 0) {
        ReadableStreamFulfillReadRequest(stream, chunk, false)
    } else {
        const result = controller.strategySizeAlgorithm(chunk);

    }
}

export function ReadableStreamDefaultControllerError(controller: ReadableStreamDefaultController, e) {
    const stream = controller.controlledReadableStream;
    if (stream.state !== "readable") {
        return;
    }
    ResetQueue(controller);
    ReadableStreamDefaultControllerClearAlgorithms(controller);
    ReadableStreamError(stream, e)
}

export function ReadableStreamDefaultControllerGetDesiredSize(controller: ReadableStreamDefaultController): number | null {
    const stream = controller.controlledReadableStream;
    const state = stream.state;
    if (state === "errored") {
        return null
    }
    if (state === "closed") {
        return 0
    }
    return controller.strategyHWM - controller.queueTotalSize;
}

export function ReadableStreamDefaultControllerHasBackpressure(controller: ReadableStreamDefaultController): boolean {
    return !ReadableStreamDefaultControllerShouldCallPull(controller);

}

export function ReadableStreamDefaultControllerCanCloseOrEnqueue(controller: ReadableStreamDefaultController): boolean {
    const state = controller.controlledReadableStream.state;
    return !controller.closeRequested && state === "readable";
}

export function SetUpReadableStreamDefaultController(params: {
    stream: ReadableStream,
    controller: ReadableStreamDefaultController,
    startAlgorithm: () => Promise<void>,
    pullAlgorithm: () => Promise<void>,
    cancelAlgorithm: () => Promise<void>,
    highWaterMark: number,
    sizeAlgorithm: (cunk) => number
}) {
    const {stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm} = params;
    let {highWaterMark, sizeAlgorithm} = params;
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
    startAlgorithm().then(() => {
        controller.started = true;
        Assert(controller.pulling == false);
        Assert(controller.pullAgain == false);
        ReadableStreamDefaultControllerCallPullIfNeeded(controller)
    }).catch(r => {
        ReadableStreamDefaultControllerError(controller, r)
    })
}

export function SetUpReadableStreamDefaultControllerFromUnderlyingSource(params: {
    stream: ReadableStream,
    underlyingSource: UnderlyingSource,
    highWaterMark: number,
    sizeAlgorithm: (chunk) => number
}) {
    const {stream, underlyingSource, highWaterMark, sizeAlgorithm} = params;
    Assert(underlyingSource !== void 0);
    const controller = new ReadableStreamDefaultController();
    const startAlgorithm = () => InvokeOrNoop(underlyingSource, "start", controller);
    const pullAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingSource, "pull", 0, controller);
    const cancelAlgorithm = CreateAlgorithmFromUnderlyingMethod(underlyingSource, "cancel", 1)
    const autoAllocateChunkSize = underlyingSource["autoAllocateChunkSize"];
    if (autoAllocateChunkSize !== void 0) {
        if (!Number.isInteger(autoAllocateChunkSize) || autoAllocateChunkSize < 0) {
            throw new RangeError()
        }
    }
    SetUpReadableByteStreamController({stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize})
}