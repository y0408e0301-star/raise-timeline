package com.example.raisetimeline.common;

import org.springframework.http.HttpStatus;

// API が返すエラーの code と、画面にそのまま出すメッセージ（機能定義書 3.3・4 章）
public enum ErrorCode {

	USERNAME_INVALID(HttpStatus.BAD_REQUEST, "ユーザー ID は 3〜15 文字の半角英数字と「_」で入力してください。"),

	USERNAME_TAKEN(HttpStatus.CONFLICT, "このユーザー ID は使われています。"),

	PASSWORD_INVALID(HttpStatus.BAD_REQUEST, "パスワードは英字と数字を含む 8〜64 文字の半角文字で入力してください。"),

	DISPLAY_NAME_REQUIRED(HttpStatus.BAD_REQUEST, "表示名を入力してください。"),

	LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "ユーザー ID かパスワードが違います。"),

	LOGIN_LOCKED(HttpStatus.LOCKED, "ログインに続けて失敗したため、15 分間ログインできません。"),

	UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "ログインの有効期限が切れました。もう一度ログインしてください。"),

	// 画面には出さない（画面が POST /api/auth/refresh で取り直して、やり直す）
	TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "ログインの有効期限が切れました。もう一度ログインしてください。"),

	REFRESH_FAILED(HttpStatus.UNAUTHORIZED, "ログインの有効期限が切れました。もう一度ログインしてください。"),

	// 投稿（FN-03 9 章）。画面では押せないようにしているので、ふつうは出ない
	BODY_TOO_LONG(HttpStatus.BAD_REQUEST, "投稿に失敗しました。時間をおいてもう一度お試しください。"),

	POST_EMPTY(HttpStatus.BAD_REQUEST, "投稿に失敗しました。時間をおいてもう一度お試しください。"),

	POST_NOT_FOUND(HttpStatus.NOT_FOUND, "この投稿は削除されました。"),

	// タイムライン（FN-02 9 章）。画面で直せることはないので M-9 を出す
	TAB_INVALID(HttpStatus.BAD_REQUEST, "読み込みに失敗しました。時間をおいてもう一度お試しください。"),

	CURSOR_INVALID(HttpStatus.BAD_REQUEST, "読み込みに失敗しました。時間をおいてもう一度お試しください。"),

	// 画面を通さずに送られた、条件に合わない入力（JSON が読めない、上限を超えた文字数など）
	BAD_REQUEST(HttpStatus.BAD_REQUEST, "入力が正しくありません。"),

	// 他人の投稿の編集・削除（FN-03 9 章）、CSRF トークンが合わないとき。画面には M-18 を出す
	FORBIDDEN(HttpStatus.FORBIDDEN, "操作に失敗しました。時間をおいてもう一度お試しください。"),

	NOT_FOUND(HttpStatus.NOT_FOUND, "見つかりません。"),

	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "操作に失敗しました。時間をおいてもう一度お試しください。");

	private final HttpStatus status;

	private final String message;

	ErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	public HttpStatus status() {
		return this.status;
	}

	public String message() {
		return this.message;
	}

}
