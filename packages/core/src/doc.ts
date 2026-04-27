import type { Block, BlockId } from "./block.js";
import type { Command } from "./commands.js";
import type { PropertyValue } from "./descriptor.js";

export interface DocSnapshot {
  blocks: Block[];
  dirty: Set<BlockId>;
}

type Listener = (snapshot: DocSnapshot) => void;

interface UndoEntry {
  command: Command;
  prevValue: PropertyValue;
}

export class Doc {
  private blocks: Map<BlockId, Block>;
  private order: BlockId[];
  private dirty = new Set<BlockId>();
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private listeners = new Set<Listener>();

  constructor(blocks: Block[]) {
    this.blocks = new Map(blocks.map((b) => [b.id, b]));
    this.order = blocks.map((b) => b.id);
  }

  getBlocks(): Block[] {
    return this.order.map((id) => this.blocks.get(id)!).filter(Boolean);
  }

  getBlock(id: BlockId): Block | undefined {
    return this.blocks.get(id);
  }

  isDirty(): boolean {
    return this.dirty.size > 0;
  }

  dirtyIds(): BlockId[] {
    return Array.from(this.dirty);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply(command: Command): void {
    if (command.type !== "setProperty") return;
    const block = this.blocks.get(command.blockId);
    if (!block) throw new Error(`Unknown block: ${command.blockId}`);
    const descriptor = block.descriptors.find((d) => d.key === command.key);
    if (!descriptor) throw new Error(`Unknown property '${command.key}' on block ${block.id}`);

    const prev = block.values[command.key];
    if (prev === command.value) return;

    block.values = { ...block.values, [command.key]: command.value };
    this.blocks.set(block.id, block);
    this.dirty.add(block.id);
    this.undoStack.push({ command, prevValue: prev as PropertyValue });
    this.redoStack = [];
    this.emit();
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    const block = this.blocks.get(entry.command.blockId);
    if (!block) return;
    const cur = block.values[entry.command.key] as PropertyValue;
    block.values = { ...block.values, [entry.command.key]: entry.prevValue };
    this.blocks.set(block.id, block);
    this.dirty.add(block.id);
    this.redoStack.push({ command: entry.command, prevValue: cur });
    this.emit();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.apply(entry.command);
  }

  markClean(): void {
    this.dirty.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  snapshot(): DocSnapshot {
    return { blocks: this.getBlocks(), dirty: new Set(this.dirty) };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}
