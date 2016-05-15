export interface ArtifactEquationParameterSet {
    start_size: number;
    end_size: number;
    method: string; // must be one of ['TSR', 'LSR', 'RANSAC', 'no_slope']
}