import { Trace } from "./trace.model";

export interface PlotConfig{
    domain: [number, number];
    range: [number, number];
    traces: Trace[],
}