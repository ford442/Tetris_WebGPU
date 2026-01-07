
export class GPUContext {
    public adapter!: GPUAdapter;
    public device!: GPUDevice;
    public canvas!: HTMLCanvasElement;
    public context!: GPUCanvasContext;
    public presentationFormat!: GPUTextureFormat;

    private constructor() {}

    public static async create(canvas: HTMLCanvasElement): Promise<GPUContext> {
        const gpuContext = new GPUContext();
        gpuContext.canvas = canvas;

        if (!navigator.gpu) {
            throw new Error("WebGPU not supported in this browser.");
        }

        gpuContext.adapter = await navigator.gpu.requestAdapter();
        if (!gpuContext.adapter) {
            throw new Error("No appropriate GPU adapter found.");
        }

        gpuContext.device = await gpuContext.adapter.requestDevice();
        gpuContext.context = canvas.getContext("webgpu") as GPUCanvasContext;
        gpuContext.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        gpuContext.configureCanvas();

        return gpuContext;
    }

    public configureCanvas(): void {
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied',
        });
    }
}
