package com.example.raisetimeline.common;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 日時の新しい順に並べる一覧の cursor（「日時（エポックからのマイクロ秒）_ID」）
class TimeCursorTests {

	@Test
	void nullなら最新より後を指すLATEST() {
		assertThat(TimeCursor.parse(null)).isSameAs(TimeCursor.LATEST);
		assertThat(TimeCursor.LATEST.at()).isAfter(Instant.parse("2999-01-01T00:00:00Z"));
		assertThat(TimeCursor.LATEST.id()).isEqualTo(Long.MAX_VALUE);
	}

	@Test
	void 日時はエポックからのマイクロ秒で書く() {
		assertThat(TimeCursor.format(Instant.parse("1970-01-01T00:00:01.000002Z"), 42)).isEqualTo("1000002_42");
	}

	@Test
	void 書いたものを読むと同じ日時とIDに戻る() {
		Instant at = Instant.parse("2026-10-24T03:00:00.123456Z");
		TimeCursor cursor = TimeCursor.parse(TimeCursor.format(at, 7));
		assertThat(cursor.at()).isEqualTo(at);
		assertThat(cursor.id()).isEqualTo(7);
	}

	@Test
	void ナノ秒はマイクロ秒に切り捨てて書く() {
		// PostgreSQL の timestamptz はマイクロ秒まで
		assertThat(TimeCursor.format(Instant.parse("1970-01-01T00:00:00.000001999Z"), 1)).isEqualTo("1_1");
	}

	@ParameterizedTest
	@ValueSource(
			strings = { "", "123", "_1", "1_", "a_1", "1_a", "1-1", "1_2_3", "-1_1", " 1_1", "1000000000000000000_1" })
	void 形が違えばCURSOR_INVALID(String cursor) {
		assertApiError(() -> TimeCursor.parse(cursor), ErrorCode.CURSOR_INVALID, "cursor");
	}

}
