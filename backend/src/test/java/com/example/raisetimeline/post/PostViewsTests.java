package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.comment.CommentRepository;
import com.example.raisetimeline.common.PostCount;
import com.example.raisetimeline.like.LikeRepository;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.ImageStorage.SignedUrl;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;

// 投稿を PostView にする。画像・いいね・コメント数は一覧の分をまとめて取る（FN-02 5.2）
@ExtendWith(MockitoExtension.class)
class PostViewsTests {

	private static final Instant EXPIRES = TestEntities.NOW.plusSeconds(900);

	@Mock
	PostImageRepository images;

	@Mock
	CommentRepository comments;

	@Mock
	LikeRepository likes;

	@Mock
	ImageStorage storage;

	@Mock
	UserIcons icons;

	private PostViews views;

	private final User taro = TestEntities.user(1, "taro_y");

	private final User hanako = TestEntities.user(2, "hanako");

	@BeforeEach
	void setUp() {
		this.views = new PostViews(this.images, this.comments, this.likes, this.storage, this.icons);
	}

	@Test
	void 投稿がなければデータベースを見ない() {
		assertThat(this.views.of(List.of(), 1)).isEmpty();
		verifyNoInteractions(this.images, this.comments, this.likes, this.storage);
	}

	@Test
	void 件数と画像は投稿ごとに分けて入れ並び順は変えない() {
		Post first = TestEntities.withId(new Post(this.taro, "1 つ目", TestEntities.NOW), 11L);
		Post second = TestEntities.withId(new Post(this.hanako, "2 つ目", TestEntities.NOW), 10L);
		List<Long> ids = List.of(11L, 10L);
		when(this.images.findByPostIdInOrderByPostIdAscSortOrderAsc(ids)).thenReturn(List
			.of(image(100, 10, "posts/a.png", 0), image(101, 10, "posts/b.png", 1), image(102, 11, "posts/c.png", 0)));
		when(this.storage.signedUrl(anyString()))
			.thenAnswer((invocation) -> new SignedUrl("https://s3/" + invocation.getArgument(0), EXPIRES));
		// 0 件の投稿は結果に入らない
		when(this.comments.countByPostIds(ids)).thenReturn(List.of(new PostCount(10, 3)));
		when(this.likes.countByPostIds(ids)).thenReturn(List.of(new PostCount(11, 5), new PostCount(10, 1)));
		when(this.likes.findLikedPostIds(1, ids)).thenReturn(List.of(10L));

		List<PostView> result = this.views.of(List.of(first, second), 1);

		assertThat(result).extracting(PostView::id).containsExactly(11L, 10L);
		PostView a = result.get(0);
		assertThat(a.likeCount()).isEqualTo(5);
		assertThat(a.commentCount()).isZero();
		assertThat(a.likedByMe()).isFalse();
		assertThat(a.mine()).isTrue();
		assertThat(a.images()).containsExactly(new PostView.Image(102, "https://s3/posts/c.png", EXPIRES));
		PostView b = result.get(1);
		assertThat(b.likeCount()).isEqualTo(1);
		assertThat(b.commentCount()).isEqualTo(3);
		assertThat(b.likedByMe()).isTrue();
		assertThat(b.mine()).isFalse();
		assertThat(b.author()).isEqualTo(new PostView.Author("hanako", "hanakoの表示名", null));
		assertThat(b.images()).extracting(PostView.Image::id).containsExactly(100L, 101L);
	}

	@Test
	void 画像の取り直しは見つかった画像だけを返す() {
		when(this.images.findAllById(List.of(100L, 999L))).thenReturn(List.of(image(100, 10, "posts/a.png", 0)));
		when(this.storage.signedUrl("posts/a.png")).thenReturn(new SignedUrl("https://s3/posts/a.png", EXPIRES));

		assertThat(this.views.images(List.of(100L, 999L)))
			.containsExactly(new PostView.Image(100, "https://s3/posts/a.png", EXPIRES));
	}

	private static PostImage image(long id, long postId, String key, int sortOrder) {
		return TestEntities.withId(new PostImage(postId, key, "image/png", 10, sortOrder), id);
	}

}
