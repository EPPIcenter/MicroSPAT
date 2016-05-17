export interface CanvasConfig {
    container: any;
    backgroundColor: string;
    domain: [number, number];
    range: [number, number];
    click_handler?: (x_coord?: number, y_coord?: number) => void;
}