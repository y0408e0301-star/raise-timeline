package com.example.raisetimeline.common;

import java.util.regex.Pattern;

// 続きを読むときの cursor（前回の nextCursor）を読む
public final class Cursors {

	// 数字だけ（18 桁までなら long に収まる）
	private static final Pattern DIGITS = Pattern.compile("[0-9]{1,18}");

	private Cursors() {
	}

	// ID の cursor（タイムライン・コメント）。正しくなければ CURSOR_INVALID
	public static long parseId(String cursor) {
		if (!DIGITS.matcher(cursor).matches()) {
			throw new ApiException(ErrorCode.CURSOR_INVALID, "cursor");
		}
		return Long.parseLong(cursor);
	}

}
