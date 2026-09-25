/** 設定ファイル監視イベントの購読を解除できる境界。 */
export interface ConfigEventSubscription {
	dispose(): void;
}

/** 設定ファイルの作成・更新イベントを提供する境界。 */
export interface ConfigFileEventSource {
	onDidCreate(listener: (uri: string) => void): ConfigEventSubscription;
	onDidChange(listener: (uri: string) => void): ConfigEventSubscription;
}

/** 設定ファイルの検出を通知する境界。 */
export interface ConfigNotificationSink {
	notify(uri: string): void;
}

/** 作成・更新を通知へ接続し、解除処理を返す。 */
export function subscribeToConfigNotifications(
	source: ConfigFileEventSource,
	sink: ConfigNotificationSink,
): ConfigEventSubscription {
	// 設定ファイルの作成・更新を同じ通知先へ接続する
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
