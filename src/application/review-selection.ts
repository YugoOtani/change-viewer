import type { ReviewSelection } from '../domain';
import type { ReviewSelectionStore } from './ports';

/** Review Route、Tree、差分画面で共有する選択状態。 */
export class InMemoryReviewSelectionStore implements ReviewSelectionStore {
	private selection: ReviewSelection | null = null;
	private disposed = false;
	private readonly listeners = new Set<(selection: ReviewSelection | null) => void>();

	get(): ReviewSelection | null {
		return this.selection;
	}

	set(selection: ReviewSelection | null): void {
		if (this.disposed) {
			return;
		}
		this.selection = selection;
		for (const listener of this.listeners) {listener(selection);}
	}

	subscribe(listener: (selection: ReviewSelection | null) => void): () => void {
		if (this.disposed) {
			return () => undefined;
		}
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
		this.selection = null;
	}
}
