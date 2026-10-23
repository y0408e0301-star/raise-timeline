package com.example.raisetimeline.post;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Limit;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;

// タイムライン（FN-02）とプロフィールの投稿の一覧（FN-09 PF-2）の読み込み方
@ExtendWith(MockitoExtension.class)
class TimelineServiceTests {

	private static final Limit LIMIT = Limit.of(TimelineService.PAGE_SIZE + 1);

	@Mock
	PostRepository posts;

	@Mock
	FollowRepository follows;

	@Mock
	UserRepository users;

	@Mock
	PostViews views;

	private TimelineService service;

	private final User taro = TestEntities.user(1, "taro_y");

	@BeforeEach
	void setUp() {
		this.service = new TimelineService(this.posts, this.follows, this.users, this.views);
	}

	@Test
	void すべてタブは最初はいちばん新しい投稿から21件取る() {
		when(this.posts.findAllBefore(Long.MAX_VALUE, LIMIT)).thenReturn(posts(100, 3));

		TimelineResponse response = this.service.read(1, "all", null);

		assertThat(response.nextCursor()).isNull();
		assertThat(response.followingCount()).isNull();
		verifyNoInteractions(this.follows);
	}

	@Test
	void 続きはcursorのIDより古い投稿を取る() {
		when(this.posts.findAllBefore(81, LIMIT)).thenReturn(posts(80, 3));
		this.service.read(1, "all", "81");
		verify(this.posts).findAllBefore(81, LIMIT);
	}

	@Test
	void 二十一件目があれば20件だけ返し20件目のIDを次のcursorにする() {
		when(this.posts.findAllBefore(Long.MAX_VALUE, LIMIT)).thenReturn(posts(100, 21));

		TimelineResponse response = this.service.read(1, "all", null);

		assertThat(response.nextCursor()).isEqualTo("81");
		assertThat(pageSentToViews(1)).hasSize(20).last().extracting(Post::getId).isEqualTo(81L);
	}

	@Test
	void ちょうど20件なら続きはない() {
		when(this.posts.findAllBefore(Long.MAX_VALUE, LIMIT)).thenReturn(posts(100, 20));
		assertThat(this.service.read(1, "all", null).nextCursor()).isNull();
	}

	@Test
	void フォロー中タブの最初の読み込みではフォロー数も返す() {
		when(this.posts.findFollowingBefore(1, Long.MAX_VALUE, LIMIT)).thenReturn(List.of());
		when(this.follows.countByFollowerId(1)).thenReturn(0L);

		assertThat(this.service.read(1, "following", null).followingCount()).isZero();
	}

	@Test
	void フォロー中タブの続きではフォロー数を数えない() {
		when(this.posts.findFollowingBefore(1, 50, LIMIT)).thenReturn(posts(49, 2));

		assertThat(this.service.read(1, "following", "50").followingCount()).isNull();
		verify(this.follows, never()).countByFollowerId(anyLong());
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "ALL", "Following", "mine", " all" })
	void タブがallとfollowing以外ならTAB_INVALID(String tab) {
		assertApiError(() -> this.service.read(1, tab, null), ErrorCode.TAB_INVALID, "tab");
		verifyNoInteractions(this.posts);
	}

	@Test
	void cursorが数字でなければCURSOR_INVALID() {
		assertApiError(() -> this.service.read(1, "all", "abc"), ErrorCode.CURSOR_INVALID, "cursor");
		verifyNoInteractions(this.posts);
	}

	@Test
	void プロフィールの投稿はその人の投稿だけを同じ読み込み方で取る() {
		User hanako = TestEntities.user(2, "hanako");
		when(this.users.findByUsername("HANAKO")).thenReturn(Optional.of(hanako));
		when(this.posts.findByAuthorBefore(2, Long.MAX_VALUE, LIMIT)).thenReturn(posts(100, 21));

		TimelineResponse response = this.service.byUser(1, "HANAKO", null);

		assertThat(response.nextCursor()).isEqualTo("81");
		assertThat(response.followingCount()).isNull();
		assertThat(pageSentToViews(1)).hasSize(20);
	}

	@Test
	void いないユーザーの投稿はUSER_NOT_FOUND() {
		when(this.users.findByUsername("nobody")).thenReturn(Optional.empty());
		assertApiError(() -> this.service.byUser(1, "nobody", null), ErrorCode.USER_NOT_FOUND);
	}

	// newest から古い順に count 件
	private List<Post> posts(long newest, int count) {
		return LongStream.range(0, count)
			.mapToObj((i) -> TestEntities.withId(new Post(this.taro, "本文", TestEntities.NOW), newest - i))
			.toList();
	}

	@SuppressWarnings("unchecked")
	private List<Post> pageSentToViews(long viewerId) {
		ArgumentCaptor<List<Post>> page = ArgumentCaptor.forClass(List.class);
		verify(this.views).of(page.capture(), eq(viewerId));
		return page.getValue();
	}

}
