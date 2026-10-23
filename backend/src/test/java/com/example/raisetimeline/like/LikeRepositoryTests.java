package com.example.raisetimeline.like;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;

import com.example.raisetimeline.RepositoryTest;
import com.example.raisetimeline.common.PostCount;
import com.example.raisetimeline.common.TimeCursor;
import com.example.raisetimeline.post.Post;
import com.example.raisetimeline.user.User;

// いいね（FN-06）：重ねても行は 1 つ（BR-6）、いいねした人の並び順（5 章 No.3）、件数のまとめ取り（FN-02 5.2）
@RepositoryTest
class LikeRepositoryTests {

	private static final Instant NOW = Instant.parse("2026-10-24T03:00:00.000001Z");

	@Autowired
	LikeRepository likes;

	@Autowired
	TestEntityManager em;

	private long taro;

	private long hanako;

	private long jiro;

	private long post;

	@BeforeEach
	void setUp() {
		User author = this.em.persist(new User("taro_y", "たろう", "hash", NOW));
		this.taro = author.getId();
		this.hanako = user("hanako");
		this.jiro = user("jiro");
		this.post = this.em.persist(new Post(author, "本文", NOW)).getId();
	}

	@Test
	void 重ねていいねしても行は1つで最初の日時のまま() {
		this.likes.insertIfAbsent(this.hanako, this.post, NOW);
		this.likes.insertIfAbsent(this.hanako, this.post, NOW.plusSeconds(60));
		this.em.clear();

		assertThat(this.likes.countByPostId(this.post)).isEqualTo(1);
		assertThat(this.likes.findById(new Like.Key(this.hanako, this.post))).get()
			.extracting(Like::getCreatedAt)
			.isEqualTo(NOW);
	}

	@Test
	void ないいいねを取り消してもエラーにならない() {
		this.likes.deleteByUserIdAndPostId(this.hanako, this.post);
		this.likes.insertIfAbsent(this.hanako, this.post, NOW);
		this.likes.deleteByUserIdAndPostId(this.hanako, this.post);
		assertThat(this.likes.countByPostId(this.post)).isZero();
	}

	@Test
	void ない投稿にはいいねできない() {
		assertThatExceptionOfType(DataIntegrityViolationException.class)
			.isThrownBy(() -> this.likes.insertIfAbsent(this.hanako, this.post + 1000, NOW));
	}

	@Test
	void 投稿ごとの件数と自分がいいねした投稿をまとめて取る() {
		long other = this.em.persist(new Post(this.em.find(User.class, this.taro), "別", NOW)).getId();
		long none = this.em.persist(new Post(this.em.find(User.class, this.taro), "なし", NOW)).getId();
		this.likes.insertIfAbsent(this.hanako, this.post, NOW);
		this.likes.insertIfAbsent(this.jiro, this.post, NOW);
		this.likes.insertIfAbsent(this.jiro, other, NOW);

		assertThat(this.likes.countByPostIds(List.of(this.post, other, none)))
			.containsExactlyInAnyOrder(new PostCount(this.post, 2), new PostCount(other, 1));
		assertThat(this.likes.findLikedPostIds(this.hanako, List.of(this.post, other, none)))
			.containsExactly(this.post);
		assertThat(this.likes.findLikedPostIds(this.taro, List.of(this.post, other, none))).isEmpty();
	}

	@Test
	void いいねした人は新しい順で同じ日時ならIDの大きい順() {
		this.likes.insertIfAbsent(this.taro, this.post, NOW);
		this.likes.insertIfAbsent(this.hanako, this.post, NOW.plusSeconds(1));
		this.likes.insertIfAbsent(this.jiro, this.post, NOW);

		List<Liker> all = likersBefore(TimeCursor.LATEST, 10);

		assertThat(all).extracting((liker) -> liker.user().getId()).containsExactly(this.hanako, this.jiro, this.taro);
		assertThat(all.getFirst().likedAt()).isEqualTo(NOW.plusSeconds(1));
	}

	@Test
	void 同じ日時の途中で区切っても重複も抜けもない() {
		this.likes.insertIfAbsent(this.taro, this.post, NOW);
		this.likes.insertIfAbsent(this.hanako, this.post, NOW);
		this.likes.insertIfAbsent(this.jiro, this.post, NOW);

		List<Liker> first = likersBefore(TimeCursor.LATEST, 2);
		Liker last = first.getLast();
		List<Liker> rest = likersBefore(TimeCursor.parse(TimeCursor.format(last.likedAt(), last.user().getId())), 2);

		assertThat(first).extracting((liker) -> liker.user().getId()).containsExactly(this.jiro, this.hanako);
		assertThat(rest).extracting((liker) -> liker.user().getId()).containsExactly(this.taro);
	}

	@Test
	void ほかの投稿のいいねは入れない() {
		long other = this.em.persist(new Post(this.em.find(User.class, this.taro), "別", NOW)).getId();
		this.likes.insertIfAbsent(this.hanako, other, NOW);
		assertThat(likersBefore(TimeCursor.LATEST, 10)).isEmpty();
	}

	private List<Liker> likersBefore(TimeCursor cursor, int limit) {
		return this.likes.findLikersBefore(this.post, cursor.at(), cursor.id(), Limit.of(limit));
	}

	private long user(String username) {
		return this.em.persist(new User(username, username, "hash", NOW)).getId();
	}

}
