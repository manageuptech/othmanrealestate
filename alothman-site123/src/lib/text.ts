export const dname = (n: string) => (/^(ضاحية|جزيرة)/.test(n) ? n : `حي ${n}`);
export const dshort = (n: string) => n.replace(/\s*\(.*\)/, '');
/** Arabic counted noun: countAr(1,'غرفة واحدة','غرفتان','غرف','غرفة') */
export const countAr = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
