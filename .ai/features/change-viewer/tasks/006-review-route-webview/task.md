# タスク

## 目標

Review Route を専用 Webview に表示し、Route の選択、順序付きステップ、CU 選択、既存コードへの移動、説明表示、「経路未割当 CU」を提供する。

## 背景

Review Route は差分 Webview と別画面で、処理の入口から変更箇所、その後の流れを推奨順に示す。CU を複数 Route や同一 Route 内に繰り返し配置でき、Route に一度も現れない CU は警告ではなく専用一覧に出す。

依存関係: 001、002、003、005。CU 選択の共通状態と表示先は 007・008・009 と共有するため、契約を先に固定する。

## 受け入れ条件

- 複数 Route を配列順に一覧表示し、選択した Route の steps を入力順に表示する。
- `explanation` は文章だけ、`cu` は CU 選択、`code` は指定 SourceLocation の既存コードを開く操作として表示する。
- Route の全 CU step を照合し、一度も参照されない CU を「経路未割当 CU」として一覧表示する。これを入力エラーや警告にしない。
- CU step の選択が共通選択状態へ通知され、Tree View と差分 Webview の選択同期につながる。
- 無効なコード参照は警告を表示し、移動操作を無効にして、他の Route 表示を継続する。
- Review Route Webview と差分 Webview が別の表示コンテナとして動作する。

## 必要な検証

- Route なし、複数 Route、同じ CU の複数参照、Route 未参照 CU、3種類の step を fixture で確認する。
- CU step 選択と既存コード step 選択で、それぞれ期待するメッセージが共通状態へ送られることを結合テストする。
- 無効な SourceLocation で移動操作が無効になり、説明 step はコードを開かないことを確認する。
- Extension Development Host で Route 切り替え、未割当 CU 選択、差分 Webview との選択同期を目視確認する。

## リスク

MEDIUM

### 理由

入力順序と共通選択状態を UI に反映する必要があり、別 Webview 間のメッセージ契約が崩れると Route と差分・Tree の表示が不整合になるため。

## 対象外

- Git 差分の計算と CU 照合。
- 差分 Webview の本文表示。
- 親コードの左右エディタグループ表示。

## 未確定事項

- Route Webview の配置（専用パネル、エディタタブ、View Column）と、入力エラーの具体的な表示形式。

