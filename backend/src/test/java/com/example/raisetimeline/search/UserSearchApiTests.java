package com.example.raisetimeline.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;
import com.example.raisetimeline.post.PostTestSupport;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

// ユーザー検索（機能定義書 FN-08）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class UserSearchApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	JdbcTemplate jdbc;

	// 検索する人（ユーザー ID は viewer）
	private Cookie viewer;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, follows RESTART IDENTITY CASCADE");
		this.viewer = PostTestSupport.signup(this.mvc, "viewer", "見る人");
	}

	// ---- 一致の判定と並び順（S-4・S-6、5.1）----

	@Test
	void 完全一致と前方一致と表示名の前方一致とそれ以外の順に並ぶ() {
		addUser("yamada_taro", "山田");
		addUser("yamada2", "山田taro");
		addUser("yamada1", "Taro Yamada");
		addUser("tarou", "たろう");
		addUser("Taro_Y", "たろう");
		addUser("TARO", "たろう");
		addUser("hanako", "はなこ");

		assertThat(usernames(search("taro"))).containsExactly("TARO", "Taro_Y", "tarou", "yamada1", "yamada2",
				"yamada_taro");
	}

	@Test
	void 同じ順位ではフォロワーの多い人が先でそれも同じならユーザーIDの順() {
		addUser("taro_c", "たろう");
		addUser("taro_b", "たろう");
		addUser("taro_a", "たろう");
		addUser("fan1", "ファン");
		addUser("fan2", "ファン");
		follow("fan1", "taro_c");
		follow("fan2", "taro_c");
		follow("fan1", "taro_b");

		assertThat(usernames(search("taro"))).containsExactly("taro_c", "taro_b", "taro_a");
	}

	@Test
	void 先頭のアットマークを取り大文字小文字を区別しない() {
		addUser("Taro_Y", "たろう");
		addUser("yamada", "TARO");
		List<String> expected = usernames(search("taro"));
		assertThat(expected).containsExactly("Taro_Y", "yamada");
		assertThat(usernames(search("@taro"))).isEqualTo(expected);
		assertThat(usernames(search("  TARO  "))).isEqualTo(expected);
	}

	@Test
	void パーセントとアンダースコアとバックスラッシュは文字として探す() {
		addUser("taro_y", "たろう");
		addUser("hanako", "は%なこ");
		addUser("jiro", "じろう\\");

		assertThat(usernames(search("_"))).containsExactly("taro_y");
		assertThat(usernames(search("%"))).containsExactly("hanako");
		assertThat(usernames(search("\\"))).containsExactly("jiro");
		assertThat(usernames(search("o_"))).containsExactly("taro_y");
	}

	@Test
	void ひらがなとカタカナは別の文字として扱う() {
		addUser("taro", "たろう");
		assertThat(usernames(search("タロウ"))).isEmpty();
		assertThat(usernames(search("たろ"))).containsExactly("taro");
	}

	@Test
	void 一文字と二文字の検索語でも結果が出る() {
		addUser("taro", "たろう");
		addUser("hanako", "はなこ");
		assertThat(usernames(search("t"))).containsExactly("taro");
		assertThat(usernames(search("な"))).containsExactly("hanako");
		assertThat(usernames(search("ar"))).containsExactly("taro");
	}

	@Test
	void 自分も結果に出てmeがtrueでフォローしている人はfollowedByMeがtrue() {
		addUser("viewer_friend", "友だち");
		addUser("viewer_other", "ほかの人");
		follow("viewer", "viewer_friend");

		MvcTestResult result = search("viewer");
		assertThat(usernames(result)).containsExactly("viewer", "viewer_friend", "viewer_other");
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"items": [
				  {"username": "viewer", "displayName": "見る人", "me": true, "followedByMe": false},
				  {"username": "viewer_friend", "me": false, "followedByMe": true},
				  {"username": "viewer_other", "me": false, "followedByMe": false}
				], "nextOffset": null}
				""");
	}

	// S-3
	@Test
	void 自己紹介と投稿の本文は検索の対象にしない() {
		addUser("hanako", "はなこ");
		this.jdbc.update("UPDATE users SET bio = 'yamabiko が好き' WHERE username = 'hanako'");
		this.jdbc.update("""
				INSERT INTO posts (user_id, body) SELECT id, 'yamabiko の写真' FROM users WHERE username = 'viewer'
				""");

		assertThat(usernames(search("yamabiko"))).isEmpty();
		assertThat(usernames(search("はなこ"))).containsExactly("hanako");
	}

	@Test
	void 一致しないときは空の一覧() {
		assertThat(search("nobody")).hasStatus(HttpStatus.OK)
			.bodyJson()
			.isStrictlyEqualTo("{\"items\":[],\"nextOffset\":null}");
	}

	// ---- 20 件ずつ（S-7）----

	@Test
	void 二十件ずつ読みnextOffsetで続きを読める() {
		for (int i = 0; i < 21; i++) {
			addUser("user%02d".formatted(i), "ユーザー");
		}
		MvcTestResult page1 = search("user", null);
		assertThat(usernames(page1)).hasSize(20).startsWith("user00").endsWith("user19");
		assertThat(page1).bodyJson().extractingPath("$.nextOffset").isEqualTo(20);

		MvcTestResult page2 = search("user", "20");
		assertThat(usernames(page2)).containsExactly("user20");
		assertThat(page2).bodyJson().extractingPath("$.nextOffset").isNull();
	}

	@Test
	void 千件より後は出さない() {
		addUser("taro", "たろう");
		assertThat(search("taro", "1000")).hasStatus(HttpStatus.OK)
			.bodyJson()
			.isStrictlyEqualTo("{\"items\":[],\"nextOffset\":null}");
	}

	// ---- 入力の確認（4 章）----

	@Test
	void 検索語が空か31文字以上なら400のQUERY_INVALID() {
		assertError(search(""), "QUERY_INVALID");
		assertError(search("   "), "QUERY_INVALID");
		assertError(search("@"), "QUERY_INVALID");
		assertError(search("あ".repeat(31)), "QUERY_INVALID");
		assertError(this.mvc.get().uri("/api/search/users").cookie(this.viewer).exchange(), "QUERY_INVALID");
		// 30 文字（先頭の @ を除いて）までは探せる
		assertThat(search("@" + "あ".repeat(30))).hasStatus(HttpStatus.OK);
	}

	@Test
	void offsetが20の倍数でないか範囲の外なら400のOFFSET_INVALID() {
		for (String offset : List.of("10", "-20", "1020", "abc")) {
			assertError(search("taro", offset), "OFFSET_INVALID");
		}
	}

	@Test
	void ログインしていなければ401() {
		assertThat(this.mvc.get().uri("/api/search/users?q=taro").exchange()).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	// ---- 速さ（N-5）----

	@Test
	void ユーザー千人で一秒以内に結果が出る() {
		List<Object[]> rows = new ArrayList<>();
		for (int i = 0; i < 1000; i++) {
			rows.add(new Object[] { "user%04d".formatted(i), "ユーザー" + i });
		}
		this.jdbc.batchUpdate("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')", rows);
		this.jdbc.execute("ANALYZE users");

		// 索引が効かない 1 文字と、効く 3 文字以上
		for (String query : List.of("u", "1", "user", "ユーザー9")) {
			long started = System.nanoTime();
			assertThat(search(query)).hasStatus(HttpStatus.OK);
			assertThat((System.nanoTime() - started) / 1_000_000).as(query).isLessThan(1000);
		}
	}

	private void addUser(String username, String displayName) {
		this.jdbc.update("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x')", username,
				displayName);
	}

	private void follow(String follower, String followee) {
		this.jdbc.update("""
				INSERT INTO follows (follower_id, followee_id)
				SELECT a.id, b.id FROM users a, users b WHERE a.username = ? AND b.username = ?
				""", follower, followee);
	}

	private MvcTestResult search(String q) {
		return search(q, null);
	}

	private MvcTestResult search(String q, @Nullable String offset) {
		var request = this.mvc.get().uri("/api/search/users").param("q", q).cookie(this.viewer);
		if (offset != null) {
			request = request.param("offset", offset);
		}
		return request.exchange();
	}

	private static List<String> usernames(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.OK);
		List<Map<String, Object>> items = JsonPath.read(content(result), "$.items");
		return items.stream().map((item) -> (String) item.get("username")).toList();
	}

	private static String content(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString();
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private static void assertError(MvcTestResult result, String code) {
		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
		assertThat(result).bodyJson().extractingPath("$.message").asString().isNotEmpty();
	}

}
