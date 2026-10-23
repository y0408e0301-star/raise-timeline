package com.example.raisetimeline.like;

import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.tuple;
import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
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
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserSummary;

// いいね（FN-06）の処理を、データベースを使わずに確かめる
@ExtendWith(MockitoExtension.class)
class LikeServiceTests {

	private static final Limit LIMIT = Limit.of(LikeService.PAGE_SIZE + 1);

	@Mock
	LikeRepository likes;

	@Mock
	PostRepository posts;

	@Mock
	FollowRepository follows;

	@Mock
	UserIcons icons;

	private LikeService service;

	@BeforeEach
	void setUp() {
		this.service = new LikeService(this.likes, this.posts, this.follows, this.icons, TestEntities.fixedClock());
	}

	@Test
	void いいねすると最新の件数を返す() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.likes.countByPostId(10)).thenReturn(3L);

		assertThat(this.service.like(1, 10)).isEqualTo(new LikeResult(true, 3));
		verify(this.likes).insertIfAbsent(1, 10, TestEntities.NOW);
	}

	@Test
	void いいねの日時はマイクロ秒にそろえて保存する() {
		Instant nanos = Instant.parse("2026-10-24T03:00:00.123456789Z");
		LikeService service = new LikeService(this.likes, this.posts, this.follows, this.icons,
				Clock.fixed(nanos, ZoneOffset.UTC));
		when(this.posts.existsById(10L)).thenReturn(true);

		service.like(1, 10);

		verify(this.likes).insertIfAbsent(1, 10, Instant.parse("2026-10-24T03:00:00.123456Z"));
	}

	@Test
	void 取り消すと最新の件数を返す() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.likes.countByPostId(10)).thenReturn(2L);

		assertThat(this.service.unlike(1, 10)).isEqualTo(new LikeResult(false, 2));
		verify(this.likes).deleteByUserIdAndPostId(1, 10);
	}

	@Test
	void ない投稿はPOST_NOT_FOUND() {
		when(this.posts.existsById(10L)).thenReturn(false);
		assertApiError(() -> this.service.like(1, 10), ErrorCode.POST_NOT_FOUND);
		assertApiError(() -> this.service.unlike(1, 10), ErrorCode.POST_NOT_FOUND);
		assertApiError(() -> this.service.likers(1, 10, null), ErrorCode.POST_NOT_FOUND);
		verifyNoInteractions(this.likes);
	}

	@Test
	void 確かめた後で投稿が削除されて外部キーで失敗してもPOST_NOT_FOUND() {
		when(this.posts.existsById(10L)).thenReturn(true);
		doThrow(new DataIntegrityViolationException("likes_post_id_fkey")).when(this.likes)
			.insertIfAbsent(1, 10, TestEntities.NOW);
		assertApiError(() -> this.service.like(1, 10), ErrorCode.POST_NOT_FOUND);
	}

	@Test
	void いいねした人の最初の読み込みはいちばん新しいものから取る() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.likes.findLikersBefore(10, TimeCursor.LATEST.at(), TimeCursor.LATEST.id(), LIMIT))
			.thenReturn(likers(2));
		when(this.follows.findFolloweeIds(1, List.of(100L, 99L))).thenReturn(List.of(99L));
		when(this.likes.countByPostId(10)).thenReturn(2L);

		LikersResponse response = this.service.likers(1, 10, null);

		assertThat(response.items()).extracting(UserSummary::username, UserSummary::followedByMe)
			.containsExactly(tuple("user100", false), tuple("user99", true));
		assertThat(response.nextCursor()).isNull();
		assertThat(response.totalCount()).isEqualTo(2);
	}

	@Test
	void 二十一件目があれば20件目の日時とIDを次のcursorにする() {
		when(this.posts.existsById(10L)).thenReturn(true);
		List<Liker> found = likers(21);
		when(this.likes.findLikersBefore(10, TimeCursor.LATEST.at(), TimeCursor.LATEST.id(), LIMIT)).thenReturn(found);

		LikersResponse response = this.service.likers(1, 10, null);

		assertThat(response.items()).hasSize(20);
		Liker last = found.get(19);
		assertThat(response.nextCursor()).isEqualTo(TimeCursor.format(last.likedAt(), last.user().getId()));
	}

	@Test
	void 続きはcursorの日時とIDより後ろから取る() {
		Instant at = Instant.parse("2026-10-24T02:00:00.000001Z");
		when(this.posts.existsById(10L)).thenReturn(true);

		this.service.likers(1, 10, TimeCursor.format(at, 5));

		verify(this.likes).findLikersBefore(10, at, 5, LIMIT);
	}

	@Test
	void cursorが正しくなければCURSOR_INVALIDでデータベースは見ない() {
		assertApiError(() -> this.service.likers(1, 10, "abc"), ErrorCode.CURSOR_INVALID, "cursor");
		verifyNoInteractions(this.posts, this.likes);
	}

	@Test
	void いいねした人がいなければフォローの状態は空の一覧で調べる() {
		when(this.posts.existsById(10L)).thenReturn(true);
		this.service.likers(1, 10, null);
		verify(this.follows).findFolloweeIds(anyLong(), eq(List.of()));
	}

	// ID の大きい順（100, 99, …）に count 人。1 秒ずつ古くなる
	private static List<Liker> likers(int count) {
		return LongStream.range(0, count)
			.mapToObj(
					(i) -> new Liker(TestEntities.user(100 - i, "user" + (100 - i)), TestEntities.NOW.minusSeconds(i)))
			.toList();
	}

}
