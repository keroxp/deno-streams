export function Assert(cond: boolean) {
  if (cond === false) throw new Error();
}
