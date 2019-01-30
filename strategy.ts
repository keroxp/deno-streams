export interface QueuingStrategy {
  readonly highWaterMark?: number;
  readonly size?: (chunk) => number;
}

export class ByteLengthQueuingStrategy implements QueuingStrategy {
  constructor({ highWaterMark }) {
    this.highWaterMark = highWaterMark;
  }

  highWaterMark: number;

  size(chunk: { byteLength: number }): number {
    return chunk.byteLength;
  }
}

export class CountQueuingStrategy implements QueuingStrategy {
  constructor({ highWaterMark }) {
    this.highWaterMark = highWaterMark;
  }

  highWaterMark: number;

  size(_): number {
    return 1;
  }
}
