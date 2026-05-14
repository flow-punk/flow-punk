import pc from "picocolors";

export const theme = {
  brand: pc.magenta,
  accent: pc.cyan,
  ok: pc.green,
  warn: pc.yellow,
  error: pc.red,
  dim: pc.dim,
  bold: pc.bold,
  /** Inline bracketed label like [auth]. */
  tag: (s: string) => pc.dim(`[${s}]`),
};
