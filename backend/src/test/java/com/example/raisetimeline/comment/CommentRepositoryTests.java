package com.example.raisetimeline.comment;

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
import com.example.raisetimeline.common.PostCount;
import com.example.raisetimeline.post.Post;
import com.example.raisetimeline.user.User;

import jakarta.persistence.PersistenceException;

// コメントの読み込み（FN-05 5 章 No.1）と、一覧に出す投稿のコメント数（FN-02 5.2）
@RepositoryTest
class CommentRepositoryTests {

	private static final Instant NOW = Instant.parse("2026-10-24T03:00:00Z");

	@Autowired
	CommentRepository comments;

	@Autowired
	TestEntityManager em;

	private User taro;

	private long postA;

	private long postB;

	@BeforeEach
	void setUp() {
		this.taro = this.em.persist(new User("taro_y", "たろう", "hash", NOW));
		this.postA = this.em.persist(new Post(this.taro, "A", NOW)).getId();
		this.postB = this.em.persist(new Post(this.taro, "B", NOW)).getId();
	}

	@Test
	void その投稿のコメントをcursorより新しいものから古い順に件数分だけ取る() {
		long first = comment(this.postA);
		comment(this.postB);
		long second = comment(this.postA);
		long third = comment(this.postA);
		this.em.clear();

		assertThat(ids(this.comments.findAfter(this.postA, 0, Limit.of(10)))).containsExactly(first, second, third);
		assertThat(ids(this.comments.findAfter(this.postA, 0, Limit.of(2)))).containsExactly(first, second);
		assertThat(ids(this.comments.findAfter(this.postA, second, Limit.of(10)))).containsExactly(third);
	}

	@Test
	void コメントした人も一緒に読む() {
		long id = comment(this.postA);
		this.em.clear();

		Comment found = this.comments.findWithAuthorById(id).orElseThrow();
		assertThat(Hibernate.isInitialized(found.getAuthor())).isTrue();
		assertThat(found.getAuthor().getUsername()).isEqualTo("taro_y");
		assertThat(this.comments.findWithAuthorById(id + 1000)).isEmpty();
	}

	@Test
	void 投稿ごとのコメント数をまとめて数え0件の投稿は入れない() {
		long postC = this.em.persist(new Post(this.taro, "C", NOW)).getId();
		comment(this.postA);
		comment(this.postA);
		comment(this.postB);

		assertThat(this.comments.countByPostIds(List.of(this.postA, this.postB, postC)))
			.containsExactlyInAnyOrder(new PostCount(this.postA, 2), new PostCount(this.postB, 1));
	}

	@Test
	void 空の本文は保存できない() {
		assertThatExceptionOfType(PersistenceException.class)
			.isThrownBy(() -> this.em.persistAndFlush(new Comment(this.postA, this.taro, "", NOW)));
	}

	@Test
	void ない投稿にはコメントできない() {
		assertThatExceptionOfType(PersistenceException.class)
			.isThrownBy(() -> this.em.persistAndFlush(new Comment(this.postB + 1000, this.taro, "本文", NOW)));
	}

	private long comment(long postId) {
		return this.em.persistAndFlush(new Comment(postId, this.taro, "本文", NOW)).getId();
	}

	private static List<Long> ids(List<Comment> comments) {
		return comments.stream().map(Comment::getId).toList();
	}

}
