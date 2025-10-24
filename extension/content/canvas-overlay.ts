import type {
  DrawingRecord,
  DrawingStroke,
  DrawingTool,
  RectPayload,
  SummaryRequestPayload
} from '@common/messages';

const OVERLAY_ID = '__scribbly-overlay__';
const CANVAS_ID = '__scribbly-overlay-canvas__';
const TOOLBAR_ID = '__scribbly-toolbar__';

const HIGHLIGHTER_COLOR = 'rgba(250, 204, 21, 0.35)';
const RECTANGLE_FILL_COLOR = 'rgba(14, 165, 233, 0.18)';
const RECTANGLE_BORDER_COLOR = '#0ea5e9';
const RECTANGLE_BORDER_WIDTH = 3;
const ERASER_SIZE = 24;

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
  private selectionOverlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private panelBody: HTMLParagraphElement;
  private tool: DrawingTool = 'highlighter';
  private drawing = false;
  private strokes: DrawingStroke[] = [];
  private strokeStack: DrawingStroke[] = [];
  private currentStroke: DrawingStroke | null = null;
  private rectSelection: { start: { x: number; y: number }; current: { x: number; y: number } } | null = null;
  private drawingId: string | null = null;
  private visible = false;
  private lastSummaryRequestId: string | null = null;

  constructor() {
    this.container = this.createContainer();
    this.canvas = this.createCanvas();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create canvas context for Scribbly');
    }
    this.ctx = ctx;
    this.toolbar = this.createToolbar();
    this.selectionOverlay = this.createSelectionOverlay();
    this.panel = this.createPanel();
    this.panelBody = this.panel.querySelector('.scribbly-panel-body') as HTMLParagraphElement;

    this.container.append(this.canvas, this.selectionOverlay, this.toolbar, this.panel);
    document.documentElement.append(this.container);
    this.toolbar.querySelector(`button[data-tool="${this.tool}"]`)?.classList.add('active');

    this.resize();
    this.restoreDrawing();
    this.registerListeners();
    this.hide();
  }

  private createContainer() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
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
      <div class="scribbly-toolbar-grid">
        <button data-tool="highlighter" aria-label="Highlighter">🖍️</button>
        <button data-tool="rectangle" aria-label="Rectangle">▭</button>
        <button data-tool="eraser" aria-label="Eraser">🧽</button>
      </div>
    `;
    return toolbar;
  }

  private createSelectionOverlay() {
    const rect = document.createElement('div');
    rect.className = 'scribbly-selection-rect';
    rect.style.display = 'none';
    return rect;
  }

  private createPanel() {
    const panel = document.createElement('div');
    panel.id = '__scribbly-panel__';
    panel.innerHTML = `
      <header class="scribbly-panel-header">Pinned Highlight</header>
      <p class="scribbly-panel-body scribbly-panel-placeholder">Highlight or draw a rectangle to pin text.</p>
    `;
    return panel;
  }

  private registerListeners() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('scroll', () => {
      this.redraw();
      if (this.rectSelection) {
        this.updateSelectionOverlay(this.rectSelection);
      }
    });
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
      if (message?.type === 'scribbly:summary-ready' && message.summary?.url === location.href) {
        if (!this.lastSummaryRequestId || message.summary.requestId === this.lastSummaryRequestId) {
          this.updatePanelContent(formatSummaryAsBullets(message.summary.summary));
          this.lastSummaryRequestId = null;
        }
      }
      if (message?.type === 'scribbly:summary-progress' && message.status === 'error') {
        if (!this.lastSummaryRequestId || message.requestId === this.lastSummaryRequestId) {
          this.updatePanelContent('Unable to summarize this highlight.');
          this.lastSummaryRequestId = null;
        }
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
      this.rectSelection = { start: { x, y }, current: { x, y } };
      this.selectionOverlay.style.display = 'block';
      this.updateSelectionOverlay(this.rectSelection);
      return;
    }

    const width = this.tool === 'highlighter' ? 18 : ERASER_SIZE;
    const stroke: DrawingStroke = {
      id: crypto.randomUUID(),
      color: HIGHLIGHTER_COLOR,
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
    if (this.tool === 'rectangle' && this.rectSelection) {
      this.rectSelection.current = coords;
      this.updateSelectionOverlay(this.rectSelection);
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

    if (this.tool === 'rectangle') {
      if (this.rectSelection) {
        const rect = this.buildRectPayload(this.rectSelection.start, this.rectSelection.current);
        this.selectionOverlay.style.display = 'none';
        this.rectSelection = null;
        if (rect.width > 1 && rect.height > 1) {
          const text = extractTextFromRect(rect);
          if (text) {
            const requestId = this.sendSummaryRequest({ text, source: 'rectangle', rect });
            if (requestId) {
              this.lastSummaryRequestId = requestId;
            }
          }
          this.addRectangleStroke(rect);
        }
      } else {
        this.selectionOverlay.style.display = 'none';
      }
      return;
    }

    if (!this.currentStroke) return;
    const completedStroke = this.currentStroke;
    this.strokes.push(completedStroke);
    this.currentStroke = null;
    this.redraw();
    if (completedStroke.tool === 'highlighter') {
      const rect = this.rectFromPoints(completedStroke.points);
      if (rect) {
        const text = extractTextFromRect(rect);
        if (text) {
          const requestId = this.sendSummaryRequest({ text, source: 'selection', rect });
          if (requestId) {
            this.lastSummaryRequestId = requestId;
          }
        }
      }
    }
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
    this.selectionOverlay.style.display = 'none';
    this.rectSelection = null;
    this.updatePanelContent('');
    this.persistDrawing();
  }

  private summarizeSelection() {
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (!text) return;
    const requestId = this.sendSummaryRequest({
      text,
      source: 'selection',
      rect: this.serializeSelectionRect(selection)
    });
    if (requestId) {
      this.lastSummaryRequestId = requestId;
    }
  }

  private sendSummaryRequest({
    text,
    source,
    rect
  }: {
    text: string;
    source: SummaryRequestPayload['source'];
    rect?: RectPayload;
  }): string | null {
    const trimmedText = text.trim();
    if (!trimmedText) return null;
    this.updatePanelContent('Summarizing highlight...');
    const payload: SummaryRequestPayload = {
      requestId: crypto.randomUUID(),
      text: trimmedText,
      url: location.href,
      title: document.title,
      source,
      rect,
      triggeredAt: Date.now()
    };
    void sendMessage({ type: 'scribbly:request-summary', payload });
    return payload.requestId;
  }

  private buildRectPayload(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): RectPayload {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    return {
      x: left,
      y: top,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
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
      color: RECTANGLE_BORDER_COLOR,
      width: RECTANGLE_BORDER_WIDTH,
      opacity: 1,
      points,
      tool: 'rectangle'
    };
    this.strokes.push(stroke);
    this.strokeStack = [];
    this.redraw();
    this.persistDrawing();
  }

  private updateSelectionOverlay(selection: {
    start: { x: number; y: number };
    current: { x: number; y: number };
  }) {
    const left = Math.min(selection.start.x, selection.current.x) - window.scrollX;
    const top = Math.min(selection.start.y, selection.current.y) - window.scrollY;
    const width = Math.abs(selection.current.x - selection.start.x);
    const height = Math.abs(selection.current.y - selection.start.y);
    this.selectionOverlay.style.left = `${left}px`;
    this.selectionOverlay.style.top = `${top}px`;
    this.selectionOverlay.style.width = `${width}px`;
    this.selectionOverlay.style.height = `${height}px`;
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

    if (stroke.tool === 'rectangle') {
      const rect = this.rectFromPoints(stroke.points);
      if (rect) {
        const left = rect.x - window.scrollX;
        const top = rect.y - window.scrollY;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = RECTANGLE_FILL_COLOR;
        this.ctx.strokeStyle = RECTANGLE_BORDER_COLOR;
        this.ctx.lineWidth = RECTANGLE_BORDER_WIDTH;
        this.ctx.beginPath();
        this.ctx.rect(left, top, rect.width, rect.height);
        this.ctx.fill();
        this.ctx.stroke();
      }
      this.ctx.restore();
      return;
    }

    if (stroke.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
    }

    const viewportPoints = stroke.points.map((point) => this.toViewportPoint(point));
    const path = this.createViewportPath(viewportPoints);
    this.ctx.stroke(path);
    this.ctx.restore();
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

  private rectFromPoints(points: Array<{ x: number; y: number }>): RectPayload | null {
    if (points.length < 2) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
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
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
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
    this.selectionOverlay.style.display = 'none';
    this.rectSelection = null;
  }

  private updatePanelContent(text: string) {
    if (!this.panelBody) return;
    if (!text) {
      this.panelBody.textContent = 'Highlight or draw a rectangle to pin text.';
      this.panelBody.classList.add('scribbly-panel-placeholder');
      return;
    }
    this.panelBody.textContent = text;
    this.panelBody.classList.remove('scribbly-panel-placeholder');
  }
}

function caretRangeAt(pageX: number, pageY: number): Range | null {
  const viewportX = pageX - window.scrollX;
  const viewportY = pageY - window.scrollY;
  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(viewportX, viewportY);
    if (range) return range;
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(viewportX, viewportY);
    if (position) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
  }
  return null;
}

function extractTextFromRect(rect: RectPayload) {
  const selection = document.getSelection();
  if (!selection) return '';
  selection.removeAllRanges();

  const startRange = caretRangeAt(rect.x + 1, rect.y + 1);
  const endRange = caretRangeAt(rect.x + rect.width - 1, rect.y + rect.height - 1);
  if (startRange && endRange) {
    const range = document.createRange();
    try {
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.startContainer, endRange.startOffset);
    } catch {
      range.selectNodeContents(document.body);
    }
    selection.addRange(range);
    const text = range.toString().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  const collected: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent && node.textContent.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const range = document.createRange();
    range.selectNodeContents(node);
    const intersects = Array.from(range.getClientRects()).some((client) => {
      const left = client.left + window.scrollX;
      const right = client.right + window.scrollX;
      const top = client.top + window.scrollY;
      const bottom = client.bottom + window.scrollY;
      return !(right < rect.x || left > rectRight || bottom < rect.y || top > rectBottom);
    });
    range.detach();
    if (intersects) {
      collected.push(node.textContent ?? '');
    }
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

function formatSummaryAsBullets(summary: string) {
  if (!summary) return '';
  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return summary.trim();
  }
  const normalized = lines.map((line) => (line.startsWith('-') ? line : `- ${line}`));
  return normalized.join('\n');
}

function ensureOverlay() {
  if (!document.getElementById(OVERLAY_ID)) {
    // eslint-disable-next-line no-new
    new ScribblyOverlay();
  }
}

ensureOverlay();
