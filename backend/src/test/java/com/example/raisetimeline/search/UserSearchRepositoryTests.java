package com.example.raisetimeline.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;

import com.example.raisetimeline.RepositoryTest;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.user.User;

// ユーザー検索の SQL（データ設計書 8 章、FN-08 S-3〜S-6）。PostgreSQL の LIKE・照合順序に頼るので、本物の DB で確かめる
@RepositoryTest
class UserSearchRepositoryTests {

	private static final Instant NOW = Instant.parse("2026-10-24T03:00:00Z");

	@Autowired
	UserSearchRepository users;

	@Autowired
	FollowRepository follows;

	@Autowired
	TestEntityManager em;

	@Test
	void ユーザーIDと表示名の部分一致で大文字小文字を区別しない() {
		user("Taro_Y", "たろう");
		user("hanako", "TARO の妹");
		user("jiro", "じろう");

		assertThat(search("taro", 0)).containsExactlyInAnyOrder("Taro_Y", "hanako");
		assertThat(search("ろう", 0)).containsExactlyInAnyOrder("Taro_Y", "jiro");
	}

	@Test
	void 完全一致_ユーザーIDの前方一致_表示名の前方一致_それ以外の順に並べる() {
		user("xtaro", "その他");
		user("hanako", "taro が好き");
		user("taro_b", "前方一致");
		user("taro", "完全一致");

		assertThat(search("taro", 0)).containsExactly("taro", "taro_b", "hanako", "xtaro");
	}

	@Test
	void 同じ順位ならフォロワーの多い順でその次はユーザーIDの文字コード順() {
		user("taroa", "a");
		user("taro_b", "a");
		long zz = user("taro_zz", "a");
		long yy = user("taro_yy", "a");
		long fan1 = user("fan1", "ファン");
		long fan2 = user("fan2", "ファン");
		this.follows.insertIfAbsent(fan1, zz, NOW);
		this.follows.insertIfAbsent(fan2, zz, NOW);
		this.follows.insertIfAbsent(fan1, yy, NOW);

		// フォロワー 2 人 → 1 人 → 0 人。0 人どうしは文字コード順で「_」（0x5F）が「a」（0x61）より前。
		// データベースの照合順序（en_US.utf8）のままだと記号を飛ばして比べるので、taroa が先になってしまう
		assertThat(search("taro", 0)).containsExactly("taro_zz", "taro_yy", "taro_b", "taroa");
	}

	@Test
	void 検索語のパーセントとアンダースコアは文字として探す() {
		user("a_b", "x");
		user("axb", "100%");
		user("ab", "100");

		assertThat(search("_", 0)).containsExactly("a_b");
		assertThat(search("%", 0)).containsExactly("axb");
	}

	@Test
	void 件数とoffsetで区切る() {
		for (int i = 0; i < 5; i++) {
			user("user" + i, "u");
		}
		assertThat(this.users.search("user", "user%", "%user%", 2, 0)).extracting(User::getUsername)
			.containsExactly("user0", "user1");
		assertThat(this.users.search("user", "user%", "%user%", 2, 4)).extracting(User::getUsername)
			.containsExactly("user4");
	}

	// サービスと同じ形（小文字・エスケープ・%）で探し、ユーザー ID を返す
	private List<String> search(String query, int offset) {
		String escaped = UserSearchService.escapeLike(query);
		return this.users.search(query, escaped + "%", "%" + escaped + "%", 20, offset)
			.stream()
			.map(User::getUsername)
			.toList();
	}

	private long user(String username, String displayName) {
		return this.em.persist(new User(username, displayName, "hash", NOW)).getId();
	}

}
