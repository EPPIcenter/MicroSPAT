export interface ArtifactEquationParameterSet {
    start_size: number;
    end_size: number;
    method: string; //"TSR" | "LSR" | "RANSAC" | "no_slope"
}