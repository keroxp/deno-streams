import { IsDetachedBuffer } from "./misc.ts";
import { Assert } from "./util.ts";
import {
  ReadableByteStreamController,
  IsReadableByteStreamController,
  ReadableByteStreamControllerRespond,
  ReadableByteStreamControllerRespondWithNewView
} from "./readable_byte_stream_controller.ts";

export interface ReadableStreamBYOBRequest {
  readonly view: Uint8Array;

  respond(bytesWritten: number): void;

  respondWithNewView(view: Uint8Array): void;
}

export class ReadableStreamBYOBRequestImpl
  implements ReadableStreamBYOBRequest {
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
    // if (view.hasOwnProperty("ViewedArrayBuffer")) {
    //   throw new TypeError();
    // }
    if (IsDetachedBuffer(this._view)) {
      throw new TypeError();
    }
    return ReadableByteStreamControllerRespondWithNewView(
      this.associatedReadableByteStreamController,
      view
    );
  }
}

export function IsReadableStreamBYOBRequest(x): x is ReadableStreamBYOBRequest {
  return (
    typeof x === "object" &&
    x.hasOwnProperty("associatedReadableByteStreamController")
  );
}

export function SetUpReadableStreamBYOBRequest(
  request: ReadableStreamBYOBRequestImpl,
  controller: ReadableByteStreamController,
  view
) {
  Assert(IsReadableByteStreamController(controller));
  Assert(typeof view === "object");
  Assert(view.hasOwnProperty("ViewedArrayBuffer"));
  Assert(view.ViewedArrayBuffer !== null);
  request.associatedReadableByteStreamController = controller;
  request._view = view;
}
