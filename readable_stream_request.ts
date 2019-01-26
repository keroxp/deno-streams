import {ReadableByteStreamController} from "./readable_stream_controller";

interface ReadableStreamBYOBRequestIface {
    new(controller: ReadableByteStreamController, view: Uint8Array): this

    respond(bytesWritten)

    respondWithNewView(view)

    associatedReadableByteStreamController: ReadableByteStreamController
    readonly view: Uint8Array
}

export class ReadableStreamBYOBRequest implements ReadableStreamBYOBRequestIface {
    constructor(controller: ReadableByteStreamController, view: Uint8Array) {
        this._view=view;
        return this;
    }
    associatedReadableByteStreamController: ReadableByteStreamController;
    readonly view: Uint8Array;

    respond(bytesWritten) {
    }

    respondWithNewView(view) {
    }

    _view: Uint8Array
}
