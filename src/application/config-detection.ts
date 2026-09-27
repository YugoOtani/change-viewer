/** 設定ファイル監視イベントの購読解除を抽象化する。 */
export interface ConfigEventSubscription {
	dispose(): void;
}

/** 設定ファイルの作成・更新イベントの購読を抽象化する。 */
export interface ConfigFileEventSource {
	onDidCreate(listener: (uri: string) => void): ConfigEventSubscription;
	onDidChange(listener: (uri: string) => void): ConfigEventSubscription;
}

/** 設定ファイルの検出通知を抽象化する。 */
export interface ConfigNotificationSink {
	notify(uri: string): void;
}

/** 設定ファイルの作成・更新時に通知し、購読の解除処理を返す。 */
export function subscribeToConfigNotifications(
	source: ConfigFileEventSource,
	sink: ConfigNotificationSink,
): ConfigEventSubscription {
	// 作成・更新の両イベントで同じ通知を送る
	const subscriptions = [
		source.onDidCreate((uri) => sink.notify(uri)),
		source.onDidChange((uri) => sink.notify(uri)),
	];

	// 2つの購読をまとめて解除できるようにする
	return {
		dispose: () => {
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
		},
	};
}
