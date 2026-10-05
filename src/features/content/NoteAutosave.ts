export type NoteSnapshot = { title: string; html: string };
export type NoteRecord = NoteSnapshot & {
  id: string;
  version: number;
  updated_at: string;
};
export class NoteAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: NoteSnapshot;
  private baseline: NoteSnapshot;
  private revision: number;
  private running: Promise<void> | null = null;
  private failed = false;
  onStatus: (
    status: "saved" | "pending" | "saving" | "error",
    error?: unknown,
  ) => void = () => {};
  constructor(
    note: NoteRecord,
    private save: (
      snapshot: NoteSnapshot,
      version: number,
    ) => Promise<NoteRecord>,
  ) {
    this.pending = { title: note.title, html: note.html };
    this.baseline = { ...this.pending };
    this.revision = note.version;
  }
  get dirty() {
    return (
      this.pending.title !== this.baseline.title ||
      this.pending.html !== this.baseline.html
    );
  }
  set(snapshot: NoteSnapshot) {
    this.pending = snapshot;
    clearTimeout(this.timer);
    if (this.dirty) {
      this.onStatus("pending");
      if (!this.failed) this.timer = setTimeout(() => void this.flush(), 700);
    } else this.onStatus("saved");
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      return this.flush();
    }
    if (!this.dirty) return;
    this.failed = false;
    const task = async () => {
      while (this.dirty) {
        const snapshot = { ...this.pending };
        if (snapshot.title.trim().length < 2) {
          this.failed = true;
          this.onStatus(
            "error",
            new Error("Enter a valid note title and content."),
          );
          return;
        }
        this.onStatus("saving");
        try {
          const result = await this.save(snapshot, this.revision);
          this.revision = result.version;
          this.baseline = snapshot;
        } catch (e) {
          this.failed = true;
          this.onStatus("error", e);
          return;
        }
      }
      this.onStatus("saved");
    };
    this.running = task();
    await this.running;
    this.running = null;
  }
}
