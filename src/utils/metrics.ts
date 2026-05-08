type MetricEntry = {
  name: string;
  value: number;
  kind: 'increment' | 'timing' | 'gauge';
  ts: number;
};

const buffer: MetricEntry[] = [];

export function increment(metric: string): void {
  buffer.push({ name: metric, value: 1, kind: 'increment', ts: Date.now() });
}

export function timing(metric: string, durationMs: number): void {
  buffer.push({ name: metric, value: durationMs, kind: 'timing', ts: Date.now() });
}

export function gauge(metric: string, value: number): void {
  buffer.push({ name: metric, value, kind: 'gauge', ts: Date.now() });
}

export function flushBufferedMetrics(): MetricEntry[] {
  const copy = [...buffer];
  buffer.length = 0;
  return copy;
}

