import { ReadableByteStreamController } from "./readable_stream_controller.ts";
import {
  IsReadableStreamBYOBRequest,
  ReadableByteStreamControllerRespond,
  ReadableByteStreamControllerRespondWithNewView
} from "./readable_stream_reader.ts";
import { IsDetachedBuffer } from "./misc.ts";

export class ReadableStreamBYOBRequest {
  constructor() {
    throw new TypeError();
  }

  associatedReadableByteStreamController: ReadableByteStreamController;
  _view: Uint8Array;
  get view() {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw new TypeError();
    }
    return this._view;
  }

  respond(bytesWritten: number) {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw new TypeError();
    }
    if (this.associatedReadableByteStreamController === void 0) {
      throw new TypeError();
    }
    if (IsDetachedBuffer(this._view)) {
      throw new TypeError();
    }
    return ReadableByteStreamControllerRespond(
      this.associatedReadableByteStreamController,
      bytesWritten
    );
  }

  respondWithNewView(view) {
    if (!IsReadableStreamBYOBRequest(this)) {
      throw new TypeError();
    }
    if (this.associatedReadableByteStreamController === void 0) {
      throw new TypeError();
    }
    if (typeof view !== "object") {
      throw new TypeError();
    }
    if (view.hasOwnProperty("ViewedArrayBuffer")) {
      throw new TypeError();
    }
    if (IsDetachedBuffer(this._view)) {
      throw new TypeError();
    }
    return ReadableByteStreamControllerRespondWithNewView(
      this.associatedReadableByteStreamController,
      view
    );
  }
}
