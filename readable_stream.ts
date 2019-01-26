import {
    IsReadableStreamBYOBReader,
    IsReadableStreamDefaultReader,
    ReadableStreamBYOBReader,
    ReadableStreamDefaultReader, ReadableStreamDefaultReaderRead,
    SetUpReadableByteStreamController,
    SetUpReadableByteStreamControllerFromUnderlyingSource
} from "./readable_stream_reader";
import {Assert} from "./util";
import {
    ReadableByteStreamController,
    ReadableStreamDefaultController,
    ReadableStreamDefaultControllerClose,
    ReadableStreamDefaultControllerEnqueue,
    ReadableStreamDefaultControllerError,
    SetUpReadableStreamDefaultController,
    SetUpReadableStreamDefaultControllerFromUnderlyingSource,
} from "./readable_stream_controller";
import {IsNonNegativeNumber, MakeSizeAlgorithmFromSizeFunction, ValidateAndNormalizeHighWaterMark} from "./misc.ts";
import {defer} from "./defer";

export type UnderlyingSource = {
    type?: string,
    autoAllocateChunkSize?: number
    startAlgorithm?: StartAlgorithm
    pullAlgorithm?: PullAlgorithm
    cancelAlgorithm?: CancelAlgorithm
}

export type Strategy = {
    size?: (chunk) => number,
    highWaterMark?: number
}

export type StartAlgorithm = () => Promise<any>
export type PullAlgorithm = () => Promise<any>
export type CancelAlgorithm = (reason) => Promise<any>
export type SizeAlgorithm<T = any> = (chunk: T) => number

export type ReadableStreamReadResult = {value, done: boolean}

export class ReadableStream {
    constructor(private readonly underlyingSource: UnderlyingSource, strategy: Strategy) {
        InitializeReadableStream(this);
        let {highWaterMark, size} = strategy;
        const {type} = underlyingSource;
        if (type === "bytes") {
            if (size !== void 0) {
                throw new RangeError()
            }
            if (highWaterMark === void 0) {
                highWaterMark = 0;
            }
            highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);
            SetUpReadableByteStreamControllerFromUnderlyingSource(this, underlyingSource, highWaterMark);
        } else if (type === void 0) {
            const sizeAlgorithm = MakeSizeAlgorithmFromSizeFunction(size);
            if (highWaterMark === void 0) {
                highWaterMark = 0;
            }
            highWaterMark = ValidateAndNormalizeHighWaterMark(highWaterMark);
            SetUpReadableStreamDefaultControllerFromUnderlyingSource({
                stream: this, underlyingSource, highWaterMark, sizeAlgorithm
            })
        } else {
            throw new RangeError()
        }
    }

    get locked(): boolean {
        if (!IsReadableStream(this)) {
            throw new TypeError()
        }
        return IsReadableStreamLocked(this);
    };

    cancel(reason): Promise<undefined> {
        if (IsReadableStream(this)) {
            return Promise.reject(new TypeError())
        }
        if (IsReadableStreamLocked(this)) {
            return Promise.reject(new TypeError())
        }
        return ReadableStreamCancel(this, reason)
    }

    getReader(params: { mode?: string } = {}): ReadableStreamDefaultReader | ReadableStreamBYOBReader {
        if (!IsReadableStream(this)) {
            throw new TypeError()
        }
        if (params.mode === void 0) {
            return AcquireReadableStreamDefaultReader(this)
        }
        if (params.mode === "byob") {
            return AcquireReadableStreamBYOBReader(this)
        }
        throw new RangeError()
    }

    pipeThrough({writable, readable}, options) {
        if (!IsReadableStream(this)) {
            throw new TypeError()
        }
    }

    pipeTo(dest, p: { preventClose, preventAbort, preventCancel, signal }) {
    }

    tee() {
        if (!IsReadableStream(this)) {
            throw new TypeError()
        }
        const branches = ReadableStreamTee(this, false)
        return [...branches]
    }

    disturbed: boolean;
    readableStreamController: ReadableByteStreamController | ReadableStreamDefaultController;
    reader: ReadableStreamDefaultReader | ReadableStreamBYOBReader;
    state: "readable" | "closed" | "errored";
    storedError: Error
}

function AcquireReadableStreamBYOBReader(stream: ReadableStream): ReadableStreamBYOBReader {
    return new ReadableStreamBYOBReader(stream);
}

function AcquireReadableStreamDefaultReader(stream: ReadableStream): ReadableStreamDefaultReader {
    return new ReadableStreamDefaultReader(stream)
}

function CreateReadableStreamInternal(params: {
    startAlgorithm: StartAlgorithm,
    pullAlgorithm: PullAlgorithm,
    cancelAlgorithm: CancelAlgorithm,
    highWaterMark?: number,
    sizeAlgorithm?: SizeAlgorithm
    autoAllocateChunkSize?: number
}, bytes: boolean): ReadableStream {
    const {startAlgorithm, pullAlgorithm, cancelAlgorithm, autoAllocateChunkSize} = params;
    let {highWaterMark, sizeAlgorithm} = params;
    if (highWaterMark === void 0) {
        highWaterMark = 1
    }
    if (sizeAlgorithm === void 0) {
        sizeAlgorithm = () => 1
    }
    Assert(IsNonNegativeNumber(sizeAlgorithm));
    const stream = new ReadableStream({
        startAlgorithm, pullAlgorithm, cancelAlgorithm,
    }, {
        size: sizeAlgorithm, highWaterMark
    });
    InitializeReadableStream(stream);
    let controller;
    if (bytes) {
        controller = new ReadableByteStreamController();
        SetUpReadableByteStreamController({
            stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize
        })
    } else {
        controller = new ReadableStreamDefaultController();
        SetUpReadableStreamDefaultController({
            stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm
        });
    }
    return stream;
}

export function CreateReadableStream(params: {
    startAlgorithm: StartAlgorithm,
    pullAlgorithm: PullAlgorithm
    cancelAlgorithm: CancelAlgorithm
    highWaterMark?: number,
    sizeAlgorithm?: SizeAlgorithm
}): ReadableStream {
    return CreateReadableStreamInternal(params, false)
}

export function CreateReadableByteStream(params: {
    startAlgorithm: StartAlgorithm,
    pullAlgorithm: PullAlgorithm
    cancelAlgorithm: CancelAlgorithm
    highWaterMark?: number,
    sizeAlgorithm?: SizeAlgorithm
}) {
    return CreateReadableStreamInternal(params, true)
}

export function InitializeReadableStream(stream: ReadableStream) {
    stream.state = "readable";
    stream.reader = void 0;
    stream.storedError = void 0;
    stream.disturbed = false;
}

export function IsReadableStream(x): x is ReadableStream {
    return typeof x === "object" && x.hasOwnProperty("readableStreamController")
}

export function IsReadableStreamDisturbed(stream: ReadableStream): boolean {
    Assert(IsReadableStream(stream));
    return stream.disturbed;
}

export function IsReadableStreamLocked(stream: ReadableStream): boolean {
    Assert(IsReadableStream(stream));
    return stream.reader !== void 0
}

export function ReadableStreamTee(stream: ReadableStream, cloneForBranch2: boolean): [ReadableStream, ReadableStream] {
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
        return ReadableStreamDefaultReaderRead(reader).then((result: { value, done: boolean }) => {
            Assert(typeof result === "object");
            const {value, done} = result;
            Assert(typeof done === "boolean");
            if (done && !closedOrErrored) {
                if (!canceled1) {
                    ReadableStreamDefaultControllerClose(branch1.readableStreamController as ReadableStreamDefaultController);
                }
                if (!canceled2) {
                    ReadableStreamDefaultControllerClose(branch2.readableStreamController as ReadableStreamDefaultController);
                }
            }
            if (closedOrErrored) {
                return;
            }
            let [value1, value2] = [value, value]
            if (!canceled2 && cloneForBranch2) {
                //value2 <- ?StructuredDeserialize( ? StructuredSerialize( value2 ), 現在の Realm Record )
            }
            if (!canceled1) {
                ReadableStreamDefaultControllerEnqueue(branch1.readableStreamController as ReadableStreamDefaultController, value1)
            }
            if (!canceled2) {
                ReadableStreamDefaultControllerEnqueue(branch1.readableStreamController as ReadableStreamDefaultController, value2)
            }
        })
    }
    const cancel1Algorithm: CancelAlgorithm = (reason) => {
        canceled1 = true;
        reason1 = reason;
        if (canceled2) {
            const compositeReason = [reason1, reason2];
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            cancelPromise.resolve(cancelResult);
        }
        return cancelPromise;
    }
    const cancel2Algorithm: CancelAlgorithm = (reason) => {
        canceled2 = true;
        reason2 = reason;
        if (canceled1) {
            const compositeReason = [reason1, reason2];
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            cancelPromise.resolve(cancelResult);
        }
        return cancelPromise;
    }
    const startAlgorithm: StartAlgorithm = () => void 0;
    branch1 = CreateReadableStream({startAlgorithm, pullAlgorithm, cancelAlgorithm: cancel1Algorithm});
    branch2 = CreateReadableStream({startAlgorithm, pullAlgorithm, cancelAlgorithm: cancel2Algorithm});
    reader.closedPromise.catch(r => {
        if (!closedOrErrored) {
            ReadableStreamDefaultControllerError(branch1.readableStreamController as ReadableStreamDefaultController, r);
            ReadableStreamDefaultControllerError(branch2.readableStreamController as ReadableStreamDefaultController, r);
            closedOrErrored = true;
        }
    });
    return [branch1, branch2]
}

export function ReadableStreamPipeTo(params: {
    source, dest, preventClose, preventAbort, preventCancel, signal
}) {
}

export function ReadableStreamAddReadIntoRequest(stream: ReadableStream, forAuthorCode) {
    Assert(IsReadableStreamBYOBReader(stream.reader));
    const reader = stream.reader as ReadableStreamBYOBReader;
    Assert(stream.state === "readable" || stream.state === "closed");
    const promise = defer();
    const readIntoRequest = {promise, forAuthorCode};
    reader.readIntoRequests.push(readIntoRequest);
    return promise;
}

export function ReadableStreamAddReadRequest(stream: ReadableStream, forAuthorCode): Promise<{ value, done: boolean }> {
    Assert(IsReadableStreamDefaultReader(stream.reader));
    const reader = stream.reader as ReadableStreamDefaultReader;
    Assert(stream.state === "readable" || stream.state === "closed");
    const promise = defer<{ value, done: boolean }>();
    const readIntoRequest = {promise, forAuthorCode};
    reader.readRequests.push(readIntoRequest);
    return promise;
}

export function ReadableStreamCancel(stream: ReadableStream, reason): Promise<undefined> {
    stream.disturbed = true;
    if (stream.state === "closed") {
        return Promise.reject(void 0)
    }
    if (stream.state === "errored") {
        return Promise.reject(stream.storedError);
    }
    ReadableStreamClose(stream);
    const sourceCancelPromise = stream.readableStreamController.cancelAlgorithm(reason);
    return sourceCancelPromise.then(() => void 0)
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
            const resolved = ReadableStreamCreateReadResult(void 0, true, req.forAuthorCode);
            req.promise.resolve(resolved);
        }
        reader.readRequests = [];
    }
    reader.closedPromise.resolve(void 0);
}

export function ReadableStreamCreateReadResult(value, done: boolean, forAuthorCode: boolean): { value: any, done: boolean } {
    const ret = forAuthorCode ? Object.create({}) : Object.create(null);
    ret["value"] = value;
    ret["done"] = done;
    return {value, done}
}

export function ReadableStreamError(stream: ReadableStream, e) {
    Assert(IsReadableStream(stream));
    Assert(stream.state === "readable");
    stream.state = "errored";
    stream.storedError = e;
    const reader = stream.reader;
    if (stream.reader === void 0) {
        return
    }
    if (IsReadableStreamDefaultReader(reader)) {
        for (const req of reader.readRequests) {
            req.promise.reject(e)
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

export function ReadableStreamFulfillReadIntoRequest(stream: ReadableStream, chunk, done) {
    const reader = stream.reader;
    const req = (<ReadableStreamBYOBReader>reader).readIntoRequests.shift();
    req.promise.resolve(ReadableStreamCreateReadResult(chunk, done, req.forAuthorCode))
}

export function ReadableStreamFulfillReadRequest(stream: ReadableStream, chunk, done) {
    const reader = stream.reader;
    const req = (<ReadableStreamDefaultReader>reader).readRequests.shift();
    req.promise.resolve(ReadableStreamCreateReadResult(chunk, done, req.forAuthorCode))
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
