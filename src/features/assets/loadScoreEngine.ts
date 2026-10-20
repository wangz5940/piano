let engine_request: Promise<typeof import("opensheetmusicdisplay")> | undefined;

/** Shared by intent prefetch and rendering; a failed download can be retried. */
export function load_score_engine() {
  engine_request ??= import("opensheetmusicdisplay").catch((error: unknown) => {
    engine_request = undefined;
    throw error;
  });
  return engine_request;
}

/** Bounded User Timing entries, containing no score or account data. */
export function start_score_measure(stage: string) {
  const start = performance.now();
  return () => {
    const name = `panio:original:${stage}`;
    performance.clearMeasures(name);
    performance.measure(name, { start, end: performance.now() });
  };
}
