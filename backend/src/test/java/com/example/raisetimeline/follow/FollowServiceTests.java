package com.example.raisetimeline.follow;

import static org.mockito.ArgumentMatchers.any;
import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.common.TimeCursor;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserRepository;
import com.example.raisetimeline.user.UserSummary;

// フォロー（FN-07）の処理を、データベースを使わずに確かめる
@ExtendWith(MockitoExtension.class)
class FollowServiceTests {

	private static final Limit LIMIT = Limit.of(FollowService.PAGE_SIZE + 1);

	@Mock
	FollowRepository follows;

	@Mock
	UserRepository users;

	@Mock
	UserIcons icons;

	private FollowService service;

	private final User hanako = TestEntities.user(2, "hanako");

	@BeforeEach
	void setUp() {
		this.service = new FollowService(this.follows, this.users, this.icons, TestEntities.fixedClock());
	}

	@Test
	void フォローすると相手の最新のフォロワー数を返す() {
		when(this.users.findByUsername("HANAKO")).thenReturn(Optional.of(this.hanako));
		when(this.follows.countByFolloweeId(2)).thenReturn(7L);

		assertThat(this.service.follow(1, "HANAKO")).isEqualTo(new FollowResult(true, 7));
		verify(this.follows).insertIfAbsent(1, 2, TestEntities.NOW);
	}

	@Test
	void 解除すると相手の最新のフォロワー数を返す() {
		when(this.users.findByUsername("hanako")).thenReturn(Optional.of(this.hanako));
		when(this.follows.countByFolloweeId(2)).thenReturn(6L);

		assertThat(this.service.unfollow(1, "hanako")).isEqualTo(new FollowResult(false, 6));
		verify(this.follows).deleteByFollowerIdAndFolloweeId(1, 2);
	}

	@Test
	void 自分はフォローできずCANNOT_FOLLOW_SELF() {
		when(this.users.findByUsername("hanako")).thenReturn(Optional.of(this.hanako));
		assertApiError(() -> this.service.follow(2, "hanako"), ErrorCode.CANNOT_FOLLOW_SELF);
		verify(this.follows, never()).insertIfAbsent(anyLong(), anyLong(), any());
	}

	@Test
	void いないユーザーはUSER_NOT_FOUND() {
		when(this.users.findByUsername("nobody")).thenReturn(Optional.empty());
		assertApiError(() -> this.service.follow(1, "nobody"), ErrorCode.USER_NOT_FOUND);
		assertApiError(() -> this.service.unfollow(1, "nobody"), ErrorCode.USER_NOT_FOUND);
		assertApiError(() -> this.service.following(1, "nobody", null), ErrorCode.USER_NOT_FOUND);
		assertApiError(() -> this.service.followers(1, "nobody", null), ErrorCode.USER_NOT_FOUND);
		verifyNoInteractions(this.follows);
	}

	@Test
	void 確かめた後で相手が消えて外部キーで失敗してもUSER_NOT_FOUND() {
		when(this.users.findByUsername("hanako")).thenReturn(Optional.of(this.hanako));
		doThrow(new DataIntegrityViolationException("follows_followee_id_fkey")).when(this.follows)
			.insertIfAbsent(1, 2, TestEntities.NOW);
		assertApiError(() -> this.service.follow(1, "hanako"), ErrorCode.USER_NOT_FOUND);
	}

	@Test
	void フォロー中の一覧は見ている人のフォローの状態とmeを付ける() {
		when(this.users.findByUsername("hanako")).thenReturn(Optional.of(this.hanako));
		List<FollowedUser> rows = List.of(row(1, 0), row(3, 1), row(4, 2));
		when(this.follows.findFollowingBefore(2, TimeCursor.LATEST.at(), TimeCursor.LATEST.id(), LIMIT))
			.thenReturn(rows);
		when(this.follows.findFolloweeIds(1, List.of(1L, 3L, 4L))).thenReturn(List.of(4L));

		FollowsResponse response = this.service.following(1, "hanako", null);

		assertThat(response.items()).extracting(UserSummary::username, UserSummary::followedByMe, UserSummary::me)
			.containsExactly(tuple("user1", false, true), tuple("user3", false, false), tuple("user4", true, false));
		assertThat(response.nextCursor()).isNull();
	}

	@Test
	void フォロワーの一覧は21件目があれば20件目の日時とIDを次のcursorにする() {
		when(this.users.findByUsername("hanako")).thenReturn(Optional.of(this.hanako));
		List<FollowedUser> rows = LongStream.range(0, 21).mapToObj((i) -> row(100 - i, i)).toList();
		Instant at = Instant.parse("2026-10-24T02:00:00Z");
		when(this.follows.findFollowersBefore(2, at, 50, LIMIT)).thenReturn(rows);

		FollowsResponse response = this.service.followers(1, "hanako", TimeCursor.format(at, 50));

		assertThat(response.items()).hasSize(20);
		assertThat(response.nextCursor()).isEqualTo(TimeCursor.format(rows.get(19).followedAt(), 81));
	}

	@Test
	void cursorが正しくなければCURSOR_INVALIDでデータベースは見ない() {
		assertApiError(() -> this.service.following(1, "hanako", "1-1"), ErrorCode.CURSOR_INVALID, "cursor");
		assertApiError(() -> this.service.followers(1, "hanako", "1-1"), ErrorCode.CURSOR_INVALID, "cursor");
		verifyNoInteractions(this.users, this.follows);
	}

	// id のユーザーを、minutesAgo 分前にフォローした行
	private static FollowedUser row(long id, long minutesAgo) {
		return new FollowedUser(TestEntities.user(id, "user" + id), TestEntities.NOW.minusSeconds(60 * minutesAgo));
	}

}
