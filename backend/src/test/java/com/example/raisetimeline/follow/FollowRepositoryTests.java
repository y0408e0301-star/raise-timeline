package com.example.raisetimeline.follow;

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
import com.example.raisetimeline.common.TimeCursor;
import com.example.raisetimeline.user.User;

// フォロー（FN-07）：重ねても行は 1 つ（BR-6）、自分はフォローできない、フォロー中・フォロワーの並び順（5 章 No.3）
@RepositoryTest
class FollowRepositoryTests {

	private static final Instant NOW = Instant.parse("2026-10-24T03:00:00.000001Z");

	@Autowired
	FollowRepository follows;

	@Autowired
	TestEntityManager em;

	private long taro;

	private long hanako;

	private long jiro;

	private long saburo;

	@BeforeEach
	void setUp() {
		this.taro = user("taro_y");
		this.hanako = user("hanako");
		this.jiro = user("jiro");
		this.saburo = user("saburo");
	}

	@Test
	void 重ねてフォローしても行は1つで最初の日時のまま() {
		this.follows.insertIfAbsent(this.taro, this.hanako, NOW);
		this.follows.insertIfAbsent(this.taro, this.hanako, NOW.plusSeconds(60));
		this.em.clear();

		assertThat(this.follows.count()).isEqualTo(1);
		assertThat(this.follows.findById(new Follow.Key(this.taro, this.hanako))).get()
			.extracting(Follow::getCreatedAt)
			.isEqualTo(NOW);
	}

	@Test
	void 自分はフォローできない() {
		assertThatExceptionOfType(DataIntegrityViolationException.class)
			.isThrownBy(() -> this.follows.insertIfAbsent(this.taro, this.taro, NOW));
	}

	@Test
	void いない人はフォローできない() {
		assertThatExceptionOfType(DataIntegrityViolationException.class)
			.isThrownBy(() -> this.follows.insertIfAbsent(this.taro, this.saburo + 1000, NOW));
	}

	@Test
	void ないフォローを解除してもエラーにならない() {
		this.follows.deleteByFollowerIdAndFolloweeId(this.taro, this.hanako);
		this.follows.insertIfAbsent(this.taro, this.hanako, NOW);
		this.follows.deleteByFollowerIdAndFolloweeId(this.taro, this.hanako);
		assertThat(this.follows.count()).isZero();
	}

	// F-5
	@Test
	void フォロー数とフォロワー数とフォローしている人を数える() {
		this.follows.insertIfAbsent(this.taro, this.hanako, NOW);
		this.follows.insertIfAbsent(this.taro, this.jiro, NOW);
		this.follows.insertIfAbsent(this.hanako, this.jiro, NOW);

		assertThat(this.follows.countByFollowerId(this.taro)).isEqualTo(2);
		assertThat(this.follows.countByFolloweeId(this.jiro)).isEqualTo(2);
		assertThat(this.follows.countByFolloweeId(this.taro)).isZero();
		assertThat(this.follows.findFolloweeIds(this.taro, List.of(this.hanako, this.saburo, this.taro)))
			.containsExactly(this.hanako);
	}

	@Test
	void フォロー中は新しい順で同じ日時なら相手のIDの大きい順() {
		this.follows.insertIfAbsent(this.taro, this.hanako, NOW);
		this.follows.insertIfAbsent(this.taro, this.jiro, NOW.plusSeconds(1));
		this.follows.insertIfAbsent(this.taro, this.saburo, NOW);
		// ほかの人のフォローは入れない
		this.follows.insertIfAbsent(this.hanako, this.jiro, NOW.plusSeconds(2));

		assertThat(ids(following(this.taro, TimeCursor.LATEST, 10))).containsExactly(this.jiro, this.saburo,
				this.hanako);
	}

	@Test
	void フォロワーも同じ順で同じ日時の途中で区切っても重複も抜けもない() {
		this.follows.insertIfAbsent(this.hanako, this.taro, NOW);
		this.follows.insertIfAbsent(this.jiro, this.taro, NOW);
		this.follows.insertIfAbsent(this.saburo, this.taro, NOW);

		List<FollowedUser> first = followers(this.taro, TimeCursor.LATEST, 2);
		FollowedUser last = first.getLast();
		List<FollowedUser> rest = followers(this.taro,
				TimeCursor.parse(TimeCursor.format(last.followedAt(), last.user().getId())), 2);

		assertThat(ids(first)).containsExactly(this.saburo, this.jiro);
		assertThat(ids(rest)).containsExactly(this.hanako);
		assertThat(first.getFirst().followedAt()).isEqualTo(NOW);
	}

	private List<FollowedUser> following(long userId, TimeCursor cursor, int limit) {
		return this.follows.findFollowingBefore(userId, cursor.at(), cursor.id(), Limit.of(limit));
	}

	private List<FollowedUser> followers(long userId, TimeCursor cursor, int limit) {
		return this.follows.findFollowersBefore(userId, cursor.at(), cursor.id(), Limit.of(limit));
	}

	private long user(String username) {
		return this.em.persist(new User(username, username, "hash", NOW)).getId();
	}

	private static List<Long> ids(List<FollowedUser> rows) {
		return rows.stream().map((row) -> row.user().getId()).toList();
	}

}
