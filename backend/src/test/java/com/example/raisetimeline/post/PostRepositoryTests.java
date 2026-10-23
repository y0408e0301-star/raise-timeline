package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.List;

import org.hibernate.Hibernate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.data.domain.Limit;

import com.example.raisetimeline.RepositoryTest;
import com.example.raisetimeline.comment.Comment;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.like.LikeRepository;
import com.example.raisetimeline.user.User;

import jakarta.persistence.PersistenceException;

// 投稿の読み込み（タイムライン FN-02、プロフィール PF-2）と、投稿の画像（FN-04）・削除したときの後始末（FN-03 5 章 No.3）
@RepositoryTest
class PostRepositoryTests {

	private static final Instant NOW = Instant.parse("2026-10-24T03:00:00Z");

	@Autowired
	PostRepository posts;

	@Autowired
	PostImageRepository images;

	@Autowired
	FollowRepository follows;

	@Autowired
	LikeRepository likes;

	@Autowired
	TestEntityManager em;

	private User taro;

	private User hanako;

	private User jiro;

	@BeforeEach
	void setUp() {
		this.taro = this.em.persist(new User("taro_y", "たろう", "hash", NOW));
		this.hanako = this.em.persist(new User("hanako", "はなこ", "hash", NOW));
		this.jiro = this.em.persist(new User("jiro", "じろう", "hash", NOW));
	}

	@Test
	void すべての投稿を新しい順にcursorより古いものから件数分だけ取る() {
		long first = post(this.taro).getId();
		long second = post(this.hanako).getId();
		long third = post(this.jiro).getId();
		this.em.clear();

		assertThat(ids(this.posts.findAllBefore(Long.MAX_VALUE, Limit.of(10)))).containsExactly(third, second, first);
		assertThat(ids(this.posts.findAllBefore(Long.MAX_VALUE, Limit.of(2)))).containsExactly(third, second);
		// cursor の投稿そのものは入れない
		assertThat(ids(this.posts.findAllBefore(second, Limit.of(10)))).containsExactly(first);
	}

	@Test
	void 投稿者も一緒に読む() {
		long id = post(this.taro).getId();
		this.em.clear();

		List<Post> found = this.posts.findAllBefore(Long.MAX_VALUE, Limit.of(10));
		assertThat(Hibernate.isInitialized(found.getFirst().getAuthor())).isTrue();
		Post one = this.posts.findWithAuthorById(id).orElseThrow();
		assertThat(Hibernate.isInitialized(one.getAuthor())).isTrue();
		assertThat(one.getAuthor().getUsername()).isEqualTo("taro_y");
	}

	@Test
	void フォロー中は自分とフォローしている人の投稿だけ() {
		this.follows.insertIfAbsent(this.taro.getId(), this.hanako.getId(), NOW);
		long mine = post(this.taro).getId();
		long followed = post(this.hanako).getId();
		post(this.jiro);
		this.em.clear();

		assertThat(ids(this.posts.findFollowingBefore(this.taro.getId(), Long.MAX_VALUE, Limit.of(10))))
			.containsExactly(followed, mine);
		assertThat(ids(this.posts.findFollowingBefore(this.taro.getId(), followed, Limit.of(10))))
			.containsExactly(mine);
	}

	@Test
	void フォローされている側のタイムラインには相手の投稿は出ない() {
		this.follows.insertIfAbsent(this.taro.getId(), this.hanako.getId(), NOW);
		post(this.taro);
		long hers = post(this.hanako).getId();
		this.em.clear();

		assertThat(ids(this.posts.findFollowingBefore(this.hanako.getId(), Long.MAX_VALUE, Limit.of(10))))
			.containsExactly(hers);
	}

	@Test
	void その人の投稿だけを新しい順に取り数える() {
		long first = post(this.taro).getId();
		post(this.hanako);
		long second = post(this.taro).getId();
		this.em.clear();

		assertThat(ids(this.posts.findByAuthorBefore(this.taro.getId(), Long.MAX_VALUE, Limit.of(10))))
			.containsExactly(second, first);
		assertThat(ids(this.posts.findByAuthorBefore(this.taro.getId(), second, Limit.of(10)))).containsExactly(first);
		assertThat(this.posts.countByAuthorId(this.taro.getId())).isEqualTo(2);
		assertThat(this.posts.countByAuthorId(this.jiro.getId())).isZero();
	}

	@Test
	void 画像は投稿ごとに並び順どおりにまとめて取る() {
		long a = post(this.taro).getId();
		long b = post(this.taro).getId();
		image(b, "posts/b1.png", 1);
		image(a, "posts/a0.png", 0);
		image(b, "posts/b0.png", 0);
		this.em.clear();

		assertThat(this.images.findByPostIdInOrderByPostIdAscSortOrderAsc(List.of(a, b)))
			.extracting(PostImage::getStorageKey)
			.containsExactly("posts/a0.png", "posts/b0.png", "posts/b1.png");
		assertThat(this.images.findByPostIdOrderBySortOrderAsc(b)).extracting(PostImage::getStorageKey)
			.containsExactly("posts/b0.png", "posts/b1.png");
		assertThat(this.images.countByPostId(b)).isEqualTo(2);
	}

	@Test
	void 同じ投稿で同じ並び順の画像は保存できない() {
		long id = post(this.taro).getId();
		image(id, "posts/a.png", 0);
		assertThatExceptionOfType(PersistenceException.class)
			.isThrownBy(() -> this.em.persistAndFlush(new PostImage(id, "posts/b.png", "image/png", 10, 0)));
	}

	@Test
	void 投稿を削除すると画像とコメントといいねの行も消える() {
		Post post = post(this.taro);
		image(post.getId(), "posts/a.png", 0);
		this.em.persist(new Comment(post.getId(), this.hanako, "よい", NOW));
		this.likes.insertIfAbsent(this.hanako.getId(), post.getId(), NOW);
		this.em.flush();
		this.em.clear();

		this.posts.delete(this.posts.findById(post.getId()).orElseThrow());
		this.em.flush();

		assertThat(count("post_images")).isZero();
		assertThat(count("comments")).isZero();
		assertThat(count("likes")).isZero();
	}

	@Test
	void 編集した本文と日時を保存し投稿日時は変えない() {
		Post post = post(this.taro);
		post.edit("新しい本文", NOW.plusSeconds(60));
		this.em.flush();
		this.em.clear();

		Post reloaded = this.posts.findById(post.getId()).orElseThrow();
		assertThat(reloaded.getBody()).isEqualTo("新しい本文");
		assertThat(reloaded.getEditedAt()).isEqualTo(NOW.plusSeconds(60));
		assertThat(reloaded.getCreatedAt()).isEqualTo(NOW);
	}

	private Post post(User author) {
		return this.em.persistAndFlush(new Post(author, author.getUsername() + "の投稿", NOW));
	}

	private void image(long postId, String key, int sortOrder) {
		this.em.persistAndFlush(new PostImage(postId, key, "image/png", 10, sortOrder));
	}

	private long count(String table) {
		return ((Number) this.em.getEntityManager()
			.createNativeQuery("select count(*) from " + table)
			.getSingleResult()).longValue();
	}

	private static List<Long> ids(List<Post> posts) {
		return posts.stream().map(Post::getId).toList();
	}

}
