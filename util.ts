export function Assert(cond: boolean, desc?: string) {
  if (cond === false) throw new Error(desc);
}

export function isAbortSignal(x): x is domTypes.AbortSignal {
  return typeof x === "object" && x.hasOwnProperty("aborted");
}
