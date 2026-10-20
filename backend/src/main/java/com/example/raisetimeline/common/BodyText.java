package com.example.raisetimeline.common;

import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;

// 投稿・コメントの本文の扱い（FN-03 5 章 No.1、FN-05 5 章 No.2）
public final class BodyText {

	// 本文の上限（コードポイントで数える。W-2・C-2）
	public static final int MAX = 280;

	private static final Pattern NEWLINE = Pattern.compile("\\r\\n?");

	private BodyText() {
	}

	// 改行を LF にそろえ、前後の空白を取り除く。
	// ブラウザは multipart で送るときに改行を CRLF に変えるので、そのまま数えると画面より改行 1 つにつき 1 文字多くなる
	public static String normalize(@Nullable String raw) {
		return (raw == null) ? "" : NEWLINE.matcher(raw).replaceAll("\n").strip();
	}

	public static boolean isTooLong(String body) {
		return body.codePointCount(0, body.length()) > MAX;
	}

}
