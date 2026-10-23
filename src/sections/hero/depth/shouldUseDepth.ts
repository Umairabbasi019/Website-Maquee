/**
 * The depth layer only runs where it is cheap and wanted: motion allowed, a 4+ core device, no data saver, a fine
 * pointer (the pointer drives most of the effect; on touch phones a GL context measurably hurt the mobile Lighthouse
 * score for a scroll-only shift) and WebGL2. `webgl2` is a probe that creates a context, so it runs last and only
 * when everything else passed.
 */
export const shouldUseDepth = (env: { webgl2: () => boolean; reducedMotion: boolean; cores: number; saveData: boolean; finePointer: boolean }) =>
  !env.reducedMotion && env.cores >= 4 && !env.saveData && env.finePointer && env.webgl2();
