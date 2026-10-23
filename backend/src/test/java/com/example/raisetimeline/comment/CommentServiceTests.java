package com.example.raisetimeline.comment;

import static org.assertj.core.api.Assertions.tuple;
import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserRepository;

// コメント（FN-05）の処理を、データベースを使わずに確かめる
@ExtendWith(MockitoExtension.class)
class CommentServiceTests {

	private static final Limit LIMIT = Limit.of(CommentService.PAGE_SIZE + 1);

	@Mock
	CommentRepository comments;

	@Mock
	PostRepository posts;

	@Mock
	UserRepository users;

	@Mock
	UserIcons icons;

	private CommentService service;

	private final User taro = TestEntities.user(1, "taro_y");

	private final User hanako = TestEntities.user(2, "hanako");

	@BeforeEach
	void setUp() {
		this.service = new CommentService(this.comments, this.posts, this.users, this.icons, TestEntities.fixedClock());
	}

	// ---- 一覧 ----

	@Test
	void 最初は古い順に51件取り自分のコメントにはmineを付ける() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.comments.findAfter(10, 0, LIMIT))
			.thenReturn(List.of(comment(1, this.taro, "1 つ目"), comment(2, this.hanako, "2 つ目")));

		CommentsResponse response = this.service.list(1, 10, null);

		assertThat(response.items()).extracting(CommentView::id, CommentView::mine)
			.containsExactly(tuple(1L, true), tuple(2L, false));
		assertThat(response.items().get(1).author().username()).isEqualTo("hanako");
		assertThat(response.nextCursor()).isNull();
	}

	@Test
	void 五十一件目があれば50件だけ返し50件目のIDを次のcursorにする() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.comments.findAfter(10, 100, LIMIT)).thenReturn(comments(101, 51));

		CommentsResponse response = this.service.list(1, 10, "100");

		assertThat(response.items()).hasSize(50);
		assertThat(response.nextCursor()).isEqualTo("150");
	}

	@Test
	void ない投稿のコメントはPOST_NOT_FOUND() {
		when(this.posts.existsById(10L)).thenReturn(false);
		assertApiError(() -> this.service.list(1, 10, null), ErrorCode.POST_NOT_FOUND);
		verifyNoInteractions(this.comments);
	}

	@Test
	void cursorが正しくなければCURSOR_INVALID() {
		assertApiError(() -> this.service.list(1, 10, "x"), ErrorCode.CURSOR_INVALID, "cursor");
	}

	// ---- 追加 ----

	@Test
	void 本文をそろえて保存する() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.users.findById(1L)).thenReturn(Optional.of(this.taro));
		when(this.comments.save(any(Comment.class)))
			.thenAnswer((invocation) -> TestEntities.withId(invocation.getArgument(0), 5L));

		CommentView view = this.service.create(1, 10, " よい\r\n写真 ");

		ArgumentCaptor<Comment> saved = ArgumentCaptor.forClass(Comment.class);
		verify(this.comments).save(saved.capture());
		assertThat(saved.getValue().getPostId()).isEqualTo(10);
		assertThat(saved.getValue().getBody()).isEqualTo("よい\n写真");
		assertThat(saved.getValue().getCreatedAt()).isEqualTo(TestEntities.NOW);
		assertThat(view.id()).isEqualTo(5);
		assertThat(view.mine()).isTrue();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { " ", "\r\n" })
	void 本文が空ならCOMMENT_INVALID(String body) {
		assertApiError(() -> this.service.create(1, 10, body), ErrorCode.COMMENT_INVALID, "body");
		verifyNoInteractions(this.posts, this.comments);
	}

	@Test
	void 本文は280文字までで281文字はCOMMENT_INVALID() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.users.findById(1L)).thenReturn(Optional.of(this.taro));
		when(this.comments.save(any(Comment.class)))
			.thenAnswer((invocation) -> TestEntities.withId(invocation.getArgument(0), 5L));
		this.service.create(1, 10, "あ".repeat(280));

		assertApiError(() -> this.service.create(1, 10, "あ".repeat(281)), ErrorCode.COMMENT_INVALID, "body");
	}

	@Test
	void ない投稿へのコメントはPOST_NOT_FOUND() {
		when(this.posts.existsById(10L)).thenReturn(false);
		assertApiError(() -> this.service.create(1, 10, "本文"), ErrorCode.POST_NOT_FOUND);
		verify(this.comments, never()).save(any());
	}

	@Test
	void 確かめた後で投稿が削除されて外部キーで失敗してもPOST_NOT_FOUND() {
		when(this.posts.existsById(10L)).thenReturn(true);
		when(this.users.findById(1L)).thenReturn(Optional.of(this.taro));
		when(this.comments.save(any(Comment.class)))
			.thenThrow(new DataIntegrityViolationException("comments_post_id_fkey"));
		assertApiError(() -> this.service.create(1, 10, "本文"), ErrorCode.POST_NOT_FOUND);
	}

	// ---- 削除 ----

	@Test
	void 自分のコメントを削除する() {
		Comment comment = comment(5, this.taro, "本文");
		when(this.comments.findWithAuthorById(5)).thenReturn(Optional.of(comment));
		this.service.delete(1, 5);
		verify(this.comments).delete(comment);
	}

	@Test
	void 投稿者でもほかの人のコメントは削除できずFORBIDDEN() {
		when(this.comments.findWithAuthorById(5)).thenReturn(Optional.of(comment(5, this.hanako, "本文")));
		assertApiError(() -> this.service.delete(1, 5), ErrorCode.FORBIDDEN);
		verify(this.comments, never()).delete(any());
	}

	@Test
	void ないコメントはCOMMENT_NOT_FOUND() {
		when(this.comments.findWithAuthorById(5)).thenReturn(Optional.empty());
		assertApiError(() -> this.service.delete(1, 5), ErrorCode.COMMENT_NOT_FOUND);
	}

	private static Comment comment(long id, User author, String body) {
		return TestEntities.withId(new Comment(10, author, body, TestEntities.NOW), id);
	}

	// first から新しい順に count 件
	private List<Comment> comments(long first, int count) {
		return LongStream.range(0, count).mapToObj((i) -> comment(first + i, this.taro, "本文")).toList();
	}

}
