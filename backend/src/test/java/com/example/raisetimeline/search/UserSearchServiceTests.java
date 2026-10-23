package com.example.raisetimeline.search;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserSummary;

// ユーザー検索（FN-08）の検索語・offset の扱いを、データベースを使わずに確かめる
@ExtendWith(MockitoExtension.class)
class UserSearchServiceTests {

	@Mock
	UserSearchRepository users;

	@Mock
	FollowRepository follows;

	@Mock
	UserIcons icons;

	private UserSearchService service;

	@BeforeEach
	void setUp() {
		this.service = new UserSearchService(this.users, this.follows, this.icons);

	}

	@Test
	void 検索語はトリムして先頭のアットマークを取り小文字にして部分一致で探す() {
		this.service.search(1, "  @Taro_Y ", null);
		verify(this.users).search("taro_y", "taro\\_y%", "%taro\\_y%", 21, 0);
	}

	@Test
	void LIKEの記号は文字として探す() {
		assertThat(UserSearchService.escapeLike("a%b_c\\d")).isEqualTo("a\\%b\\_c\\\\d");
		assertThat(UserSearchService.escapeLike("たろう")).isEqualTo("たろう");
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { " ", "@", " @ " })
	void 検索語が空ならQUERY_INVALID(String q) {
		assertApiError(() -> this.service.search(1, q, null), ErrorCode.QUERY_INVALID, "q");
		verifyNoInteractions(this.users);

	}

	@Test
	void 検索語は30文字までで先頭のアットマークは数えない() {
		this.service.search(1, "@" + "あ".repeat(30), null);
		assertApiError(() -> this.service.search(1, "あ".repeat(31), null), ErrorCode.QUERY_INVALID, "q");
	}

	@ParameterizedTest
	@ValueSource(strings = { "-20", "10", "1020", "abc", "", "20.0" })
	void offsetは0以上1000以下の20の倍数でなければOFFSET_INVALID(String offset) {
		assertApiError(() -> this.service.search(1, "taro", offset), ErrorCode.OFFSET_INVALID, "offset");
		verifyNoInteractions(this.users);
	}

	@Test
	void offsetが1000なら探さずに空を返す() {
		UserSearchResponse response = this.service.search(1, "taro", "1000");
		assertThat(response.items()).isEmpty();
		assertThat(response.nextOffset()).isNull();
		verifyNoInteractions(this.users);
	}

	@Test
	void 二十一件目があれば次のoffsetを返す() {
		when(this.users.search(anyString(), anyString(), anyString(), anyInt(), anyInt())).thenReturn(users(21));
		UserSearchResponse response = this.service.search(1, "user", "40");
		assertThat(response.items()).hasSize(20);
		assertThat(response.nextOffset()).isEqualTo(60);
	}

	@Test
	void 次のoffsetが1000になるときは続きを出さない() {
		when(this.users.search(anyString(), anyString(), anyString(), anyInt(), anyInt())).thenReturn(users(21));
		assertThat(this.service.search(1, "user", "980").nextOffset()).isNull();
	}

	@Test
	void 自分も結果に出し見ている人のフォローの状態を付ける() {
		when(this.users.search(anyString(), anyString(), anyString(), anyInt(), anyInt()))
			.thenReturn(List.of(TestEntities.user(1, "taro_y"), TestEntities.user(2, "taro_b")));
		when(this.follows.findFolloweeIds(1, List.of(1L, 2L))).thenReturn(List.of(2L));

		UserSearchResponse response = this.service.search(1, "taro", null);

		assertThat(response.items()).extracting(UserSummary::username, UserSummary::me, UserSummary::followedByMe)
			.containsExactly(tuple("taro_y", true, false), tuple("taro_b", false, true));
		assertThat(response.nextOffset()).isNull();
	}

	private static List<User> users(int count) {
		return LongStream.rangeClosed(1, count).mapToObj((id) -> TestEntities.user(id, "user" + id)).toList();
	}

}
