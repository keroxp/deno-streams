export function Assert(cond: boolean, desc?: string) {
  if (cond === false) throw new Error(desc);
}
