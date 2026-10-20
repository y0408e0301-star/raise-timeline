package com.example.raisetimeline.common;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;

// 日時の新しい順に並べる一覧（いいねした人・フォロー中・フォロワー）の cursor。
// 「日時（エポックからのマイクロ秒）_ID」の形で、同じ日時のときは ID の大きい順に並べる
public record TimeCursor(Instant at, long id) {

	// 最初の 20 件を読むときの cursor の代わり。どの行よりも後
	public static final TimeCursor LATEST = new TimeCursor(Instant.parse("9999-12-31T00:00:00Z"), Long.MAX_VALUE);

	private static final Pattern PATTERN = Pattern.compile("([0-9]{1,18})_([0-9]{1,18})");

	// null なら LATEST。正しくなければ CURSOR_INVALID
	public static TimeCursor parse(@Nullable String cursor) {
		if (cursor == null) {
			return LATEST;
		}
		Matcher matcher = PATTERN.matcher(cursor);
		if (!matcher.matches()) {
			throw new ApiException(ErrorCode.CURSOR_INVALID, "cursor");
		}
		return new TimeCursor(Instant.EPOCH.plus(Long.parseLong(matcher.group(1)), ChronoUnit.MICROS),
				Long.parseLong(matcher.group(2)));
	}

	public static String format(Instant at, long id) {
		return ChronoUnit.MICROS.between(Instant.EPOCH, at) + "_" + id;
	}

}
