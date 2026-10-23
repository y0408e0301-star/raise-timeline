package com.example.raisetimeline.common;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 続きを読むときの ID の cursor（タイムライン・コメント）
class CursorsTests {

	@Test
	void 数字ならlongにする() {
		assertThat(Cursors.parseId("0")).isZero();
		assertThat(Cursors.parseId("123")).isEqualTo(123);
		assertThat(Cursors.parseId("007")).isEqualTo(7);
	}

	@Test
	void 数字18桁までは読める() {
		assertThat(Cursors.parseId("999999999999999999")).isEqualTo(999_999_999_999_999_999L);
	}

	@ParameterizedTest
	@ValueSource(strings = { "", " ", "abc", "1a", "-1", "+1", "1.5", " 1", "1 ", "1_2", "１２３", "1000000000000000000" })
	void 数字18桁以外はCURSOR_INVALID(String cursor) {
		assertApiError(() -> Cursors.parseId(cursor), ErrorCode.CURSOR_INVALID, "cursor");
	}

}
