import * as assert from 'assert';

import {
	subscribeToConfigNotifications,
} from '../application/config-detection';
import type {
	ConfigEventSubscription,
	ConfigFileEventSource,
} from '../application/config-detection';

class FakeConfigEvents implements ConfigFileEventSource {
	private readonly createListeners: Array<(uri: string) => void> = [];
	private readonly changeListeners: Array<(uri: string) => void> = [];

	onDidCreate(listener: (uri: string) => void): ConfigEventSubscription {
		this.createListeners.push(listener);
		return { dispose: () => this.remove(this.createListeners, listener) };
	}

	onDidChange(listener: (uri: string) => void): ConfigEventSubscription {
		this.changeListeners.push(listener);
		return { dispose: () => this.remove(this.changeListeners, listener) };
	}

	fireCreate(uri: string): void {
		for (const listener of this.createListeners) {
			listener(uri);
		}
	}

	fireChange(uri: string): void {
		for (const listener of this.changeListeners) {
			listener(uri);
		}
	}

	private remove(listeners: Array<(uri: string) => void>, listener: (uri: string) => void): void {
		const index = listeners.indexOf(listener);
		if (index >= 0) {
			listeners.splice(index, 1);
		}
	}
}

suite('設定ファイル検出通知', () => {
	test('作成と更新を通知するが、レビュー開始は行わない', () => {
		const events = new FakeConfigEvents();
		const notifications: string[] = [];
		const subscription = subscribeToConfigNotifications(events, {
			notify: (uri) => notifications.push(uri),
		});

		events.fireCreate('file:///project/.vscode/change-viewer.json');
		events.fireChange('file:///project/.vscode/change-viewer.json');

		assert.deepStrictEqual(notifications, [
			'file:///project/.vscode/change-viewer.json',
			'file:///project/.vscode/change-viewer.json',
		]);

		subscription.dispose();
		events.fireChange('file:///project/.vscode/change-viewer.json');
		assert.strictEqual(notifications.length, 2);
	});
});
