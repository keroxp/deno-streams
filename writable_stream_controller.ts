export interface WritableStreamController {
  error(e)
}

export const ErrorSteps = Symbol("ErrorSteps");
export const AbortSteps = Symbol("AbortSteps");

export class WritableStreamDefaultController implements WritableStreamController {
  [ErrorSteps]: () => Promise<any>
  [AbortSteps]: (reason) => Promise<any>
  abortAlgorithm
  closeAlgorithm
  controlledWritableStream
  queue: []
  queueTotalSize: number
  started
  strategyHWM
  strategySizeAlgorithm
  writeAlgorithm

  error(e) {
  }

}

export function IsWritableStreamDefaultController(x) {
}

export function SetUpWritableStreamDefaultController(params: {
  stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm
}) {
}

export function SetUpWritableStreamDefaultControllerFromUnderlyingSink(stream, underlyingSink, highWaterMark, sizeAlgorithm) {
}

export function WritableStreamDefaultControllerClearAlgorithms(controller) {
}

export function WritableStreamDefaultControllerClose(controller) {
}

export function WritableStreamDefaultControllerGetChunkSize(controller, chunk) {
}

export function WritableStreamDefaultControllerGetDesiredSize(controller) {
}

export function WritableStreamDefaultControllerWrite(controller, chunk, chunkSize) {
}

export function WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller) {
}

export function WritableStreamDefaultControllerErrorIfNeeded(controller, error) {
}

export function WritableStreamDefaultControllerProcessClose(controller) {
}

export function WritableStreamDefaultControllerProcessWrite(controller, chunk) {
}

export function WritableStreamDefaultControllerGetBackpressure(controller) {
}

export function WritableStreamDefaultControllerError(controller, error) {
}