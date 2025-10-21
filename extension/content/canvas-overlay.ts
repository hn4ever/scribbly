import type {
  DrawingRecord,
  DrawingStroke,
  RectPayload,
  SummaryRequestPayload,
  DrawingTool
} from '@common/messages';

const OVERLAY_ID = '__scribbly-overlay__';
const CANVAS_ID = '__scribbly-overlay-canvas__';
const TOOLBAR_ID = '__scribbly-toolbar__';

const PEN_COLOR = '#2563eb';
const HIGHLIGHTER_COLOR = 'rgba(250, 204, 21, 0.35)';
const ERASER_SIZE = 24;
const RECTANGLE_STROKE_COLOR = '#22d3ee';
const RECTANGLE_FILL_COLOR = 'rgba(34, 211, 238, 0.12)';

function sendMessage<T = unknown>(message: unknown): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response as T | undefined);
    });
  });
}

class ScribblyOverlay {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private toolbar: HTMLDivElement;
  private tool: DrawingTool = 'pen';
  private drawing = false;
  private strokes: DrawingStroke[] = [];
  private strokeStack: DrawingStroke[] = [];
  private currentStroke: DrawingStroke | null = null;
  private currentRect: { start: { x: number; y: number }; current: { x: number; y: number } } | null = null;
  private displayRect: HTMLDivElement;
  private rectStart: { x: number; y: number } | null = null;
  private drawingId: string | null = null;
  private visible = false;

  constructor() {
    this.container = this.createContainer();
    this.canvas = this.createCanvas();
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create canvas context for Scribbly');
    }
    this.ctx = context;
    this.toolbar = this.createToolbar();
    this.displayRect = this.createRectDisplay();

    this.container.append(this.canvas, this.displayRect, this.toolbar);
    document.documentElement.append(this.container);
    this.toolbar.querySelector(`button[data-tool="${this.tool}"]`)?.classList.add('active');

    this.resize();
    this.restoreDrawing();
    this.registerListeners();
    this.hide();
  }

  private createContainer() {
    const existing = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
    if (existing) {
      existing.remove();
    }
    const container = document.createElement('div');
    container.id = OVERLAY_ID;
    container.dataset.scribbly = 'overlay';
    return container;
  }

  private createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    return canvas;
  }

  private createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <button data-tool="pen" aria-label="Pen">✏️</button>
      <button data-tool="highlighter" aria-label="Highlighter">🖍️</button>
      <button data-tool="rectangle" aria-label="Rectangle">▭</button>
      <button data-tool="eraser" aria-label="Eraser">🧽</button>
      <hr />
      <button data-action="undo" aria-label="Undo">↩︎</button>
      <button data-action="redo" aria-label="Redo">↪︎</button>
      <button data-action="clear" aria-label="Clear">🗑️</button>
      <button data-action="summarize-selection" aria-label="Summarize selection">⚡</button>
    `;
    return toolbar;
  }

  private createRectDisplay() {
    const rect = document.createElement('div');
    rect.className = 'scribbly-selection-rect';
    rect.style.display = 'none';
    return rect;
  }

  private registerListeners() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('scroll', () => this.redraw());
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointerleave', (event) => this.onPointerUp(event));
    this.toolbar.addEventListener('click', (event) => this.onToolbarClick(event));

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'scribbly:overlay-toggle') {
        this.toggle(message.visible);
      }
      if (message?.type === 'scribbly:drawings' && message.url === location.href) {
        if (message.drawings.length > 0) {
          this.loadDrawing(message.drawings[0]);
        }
      }
      if (message?.type === 'scribbly:set-tool') {
        this.toggle(true);
        this.setTool(message.tool);
      }
      if (message?.type === 'scribbly:overlay-command') {
        this.toggle(true);
        this.runCommand(message.command);
      }
    });
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.redraw();
  }

  private onPointerDown(event: PointerEvent) {
    if (!this.visible) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.drawing = true;

    const { x, y } = this.getCanvasCoordinates(event);
    if (this.tool === 'rectangle') {
      this.currentRect = { start: { x, y }, current: { x, y } };
      this.displayRect.style.display = 'block';
      this.updateDisplayRect(x, y, 0, 0);
      return;
    }

    const width = this.tool === 'highlighter' ? 18 : this.tool === 'eraser' ? ERASER_SIZE : 4;
    const stroke: DrawingStroke = {
      id: crypto.randomUUID(),
      color: this.tool === 'highlighter' ? HIGHLIGHTER_COLOR : PEN_COLOR,
      width,
      opacity: this.tool === 'highlighter' ? 0.35 : 1,
      points: [{ x, y }],
      tool: this.tool
    };
    this.currentStroke = stroke;
    this.strokeStack = [];
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.drawing) return;
    const coords = this.getCanvasCoordinates(event);
    if (this.tool === 'rectangle' && this.currentRect) {
      this.currentRect.current = coords;
      const width = coords.x - this.currentRect.start.x;
      const height = coords.y - this.currentRect.start.y;
      this.updateDisplayRect(
        this.currentRect.start.x,
        this.currentRect.start.y,
        width,
        height
      );
      this.redraw();
      this.drawRectanglePreview();
      return;
    }

    if (!this.currentStroke) return;
    this.currentStroke.points.push(coords);
    this.drawStroke(this.currentStroke);
  }

  private onPointerUp(event: PointerEvent) {
    if (!this.drawing) return;
    this.drawing = false;
    this.canvas.releasePointerCapture(event.pointerId);

    if (this.tool === 'rectangle' && this.currentRect) {
      const { x, y } = this.getCanvasCoordinates(event);
      const rect = this.buildRectPayload(this.currentRect.start, { x, y });
      this.displayRect.style.display = 'none';
      this.currentRect = null;
      this.addRectangleStroke(rect);
      void this.extractAndSummarize(rect);
      return;
    }

    if (!this.currentStroke) return;
    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
    this.redraw();
    this.persistDrawing();
  }

  private onToolbarClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tool = target.getAttribute('data-tool') as DrawingTool | null;
    if (tool) {
      this.setTool(tool);
      return;
    }

    const action = target.getAttribute('data-action');
    switch (action) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'clear':
        this.clear();
        break;
      case 'summarize-selection':
        this.summarizeSelection();
        break;
      default:
        break;
    }
  }

  private undo() {
    const stroke = this.strokes.pop();
    if (!stroke) return;
    this.strokeStack.push(stroke);
    this.redraw();
    this.persistDrawing();
  }

  private redo() {
    const stroke = this.strokeStack.pop();
    if (!stroke) return;
    this.strokes.push(stroke);
    this.redraw();
    this.persistDrawing();
  }

  private clear() {
    this.strokes = [];
    this.strokeStack = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.persistDrawing();
  }

  private summarizeSelection() {
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (!text) return;
    this.sendSummaryRequest({
      text,
      source: 'selection',
      rect: this.serializeSelectionRect(selection)
    });
  }

  private buildRectPayload(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): RectPayload {
    const left = Math.min(from.x, to.x);
    const top = Math.min(from.y, to.y);
    return {
      x: left,
      y: top,
      width: Math.abs(from.x - to.x),
      height: Math.abs(from.y - to.y)
    };
  }

  private addRectangleStroke(rect: RectPayload) {
    const points = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x, y: rect.y }
    ];

    const stroke: DrawingStroke = {
      id: crypto.randomUUID(),
      color: RECTANGLE_STROKE_COLOR,
      width: 2,
      opacity: 1,
      points,
      tool: 'rectangle'
    };
    this.strokes.push(stroke);
    this.strokeStack = [];
    this.redraw();
    this.drawRectangleFill(rect);
    this.persistDrawing();
  }

  private updateDisplayRect(x: number, y: number, width: number, height: number) {
    const rect = this.displayRect;
    const left = Math.min(x, x + width) - window.scrollX;
    const top = Math.min(y, y + height) - window.scrollY;
    rect.style.left = `${left}px`;
    rect.style.top = `${top}px`;
    rect.style.width = `${Math.abs(width)}px`;
    rect.style.height = `${Math.abs(height)}px`;
  }

  private async extractAndSummarize(rect: RectPayload) {
    const text = extractTextFromRect(rect);
    if (!text) return;
    this.sendSummaryRequest({
      text,
      source: 'rectangle',
      rect
    });
  }

  private sendSummaryRequest({
    text,
    source,
    rect
  }: {
    text: string;
    source: SummaryRequestPayload['source'];
    rect?: RectPayload;
  }) {
    const payload: SummaryRequestPayload = {
      requestId: crypto.randomUUID(),
      text,
      url: location.href,
      title: document.title,
      source,
      rect,
      triggeredAt: Date.now()
    };
    void sendMessage({ type: 'scribbly:request-summary', payload });
  }

  private createViewportPath(points: Array<{ x: number; y: number }>) {
    const path = new Path2D();
    if (points.length === 0) return path;
    const [start, ...rest] = points;
    path.moveTo(start.x, start.y);
    rest.forEach((point) => path.lineTo(point.x, point.y));
    return path;
  }

  private drawStroke(stroke: DrawingStroke) {
    this.ctx.save();
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.lineWidth = stroke.width;

    if (stroke.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else if (stroke.tool === 'highlighter') {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
    } else if (stroke.tool === 'rectangle') {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
    }

    const viewportPoints = stroke.points.map((point) => this.toViewportPoint(point));
    const path = this.createViewportPath(viewportPoints);
    this.ctx.stroke(path);
    this.ctx.restore();
  }

  private drawRectangleFill(rect: RectPayload) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = RECTANGLE_FILL_COLOR;
    ctx.strokeStyle = RECTANGLE_STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(rect.x - window.scrollX, rect.y - window.scrollY, rect.width, rect.height);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawRectanglePreview() {
    if (!this.currentRect) return;
    const { start, current } = this.currentRect;
    const rect = this.buildRectPayload(start, current);
    this.drawRectangleFill(rect);
  }

  private redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokes.forEach((stroke) => this.drawStroke(stroke));
  }

  private getCanvasCoordinates(event: PointerEvent) {
    return {
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY
    };
  }

  private toViewportPoint(point: { x: number; y: number }) {
    return {
      x: point.x - window.scrollX,
      y: point.y - window.scrollY
    };
  }

  private async persistDrawing() {
    const record: DrawingRecord = {
      id: this.drawingId ?? crypto.randomUUID(),
      url: location.href,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      strokes: this.strokes,
      imageDataUrl: this.canvas.toDataURL('image/png')
    };
    this.drawingId = record.id;
    void sendMessage({ type: 'scribbly:save-drawing', drawing: record });
  }

  private async restoreDrawing() {
    void sendMessage({ type: 'scribbly:fetch-drawings', url: location.href });
  }

  private loadDrawing(record: DrawingRecord) {
    this.drawingId = record.id;
    this.strokes = record.strokes ?? [];
    this.redraw();
  }

  private serializeSelectionRect(selection: Selection): RectPayload | undefined {
    if (selection.rangeCount === 0) return undefined;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect) return undefined;
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }

  toggle(visible: boolean) {
    this.visible = visible;
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  private show() {
    this.container.style.display = 'block';
    this.container.setAttribute('data-visible', 'true');
    this.container.style.pointerEvents = 'auto';
  }

  private hide() {
    this.container.style.display = 'none';
    this.container.setAttribute('data-visible', 'false');
    this.container.style.pointerEvents = 'none';
  }

  private setTool(tool: DrawingTool) {
    this.tool = tool;
    this.toolbar
      .querySelectorAll<HTMLButtonElement>('button[data-tool]')
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === tool));
  }

  private runCommand(command: 'undo' | 'redo' | 'clear' | 'summarize-selection') {
    switch (command) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'clear':
        this.clear();
        break;
      case 'summarize-selection':
        this.summarizeSelection();
        break;
      default:
        break;
    }
  }
}

function extractTextFromRect(rect: RectPayload) {
  const selection = document.getSelection();
  if (!selection) return '';
  selection.removeAllRanges();

  const viewportStartX = rect.x - window.scrollX + 1;
  const viewportStartY = rect.y - window.scrollY + 1;
  const viewportEndX = rect.x - window.scrollX + rect.width - 1;
  const viewportEndY = rect.y - window.scrollY + rect.height - 1;

  const start = document.caretRangeFromPoint(viewportStartX, viewportStartY);
  const end = document.caretRangeFromPoint(viewportEndX, viewportEndY);
  if (!start || !end) return '';

  const range = document.createRange();
  range.setStart(start.startContainer, start.startOffset);
  range.setEnd(end.startContainer, end.startOffset);
  selection.addRange(range);
  return range.toString().trim();
}

function ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  // eslint-disable-next-line no-new
  new ScribblyOverlay();
}

ensureOverlay();
