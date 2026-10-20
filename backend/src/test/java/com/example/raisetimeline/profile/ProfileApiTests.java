package com.example.raisetimeline.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.List;

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

// プロフィールの表示（機能定義書 FN-09 第 1 版）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class ProfileApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	// users.id は 1
	private Cookie taro;

	// users.id は 2
	private Cookie hanako;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, likes, comments, follows RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.taro = PostTestSupport.signup(this.mvc, "Taro_Y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
	}

	// ---- プロフィール（PF-1・PF-3・PF-4）----

	@Test
	void プロフィールは件数とフォローしているかを返す() {
		this.jdbc.update("UPDATE users SET bio = ? WHERE id = 1", "川沿いを散歩するのが好きです\n2 行目");
		Cookie jiro = PostTestSupport.signup(this.mvc, "jiro", "じろう");
		follow(this.hanako, "taro_y");
		follow(jiro, "taro_y");
		follow(this.taro, "jiro");
		createPost(this.taro, "1 つ目");
		createPost(this.taro, "2 つ目");
		createPost(this.hanako, "はなこの投稿");

		assertThat(profile(this.hanako, "taro_y")).bodyJson().isStrictlyEqualTo("""
				{
				  "username": "Taro_Y",
				  "displayName": "たろう",
				  "bio": "川沿いを散歩するのが好きです\\n2 行目",
				  "iconUrl": null,
				  "joinedAt": "%s",
				  "followingCount": 1,
				  "followerCount": 2,
				  "postCount": 2,
				  "followedByMe": true,
				  "me": false
				}
				""".formatted(this.clock.instant()));
	}

	@Test
	void ユーザーIDの大文字小文字を変えても同じ人で登録したときの書き方で返す() {
		assertThat(profile(this.hanako, "TARO_Y")).bodyJson().extractingPath("$.username").isEqualTo("Taro_Y");
		assertThat(profile(this.hanako, "taro_y")).bodyJson().extractingPath("$.username").isEqualTo("Taro_Y");
	}

	@Test
	void 自分のプロフィールはmeがtrueでfollowedByMeはfalse() {
		assertThat(profile(this.taro, "taro_y")).bodyJson()
			.isLenientlyEqualTo("{\"me\":true,\"followedByMe\":false,\"followerCount\":0}");
		assertThat(profile(this.taro, "hanako")).bodyJson().isLenientlyEqualTo("{\"me\":false,\"followedByMe\":false}");
	}

	@Test
	void フォローを外すと件数とfollowedByMeが戻る() {
		follow(this.hanako, "taro_y");
		assertThat(this.mvc.delete().uri("/api/users/taro_y/follow").with(csrf()).cookie(this.hanako).exchange())
			.hasStatus(HttpStatus.OK);
		assertThat(profile(this.hanako, "taro_y")).bodyJson()
			.isLenientlyEqualTo("{\"followerCount\":0,\"followedByMe\":false}");
	}

	@Test
	void いないユーザーは404() {
		assertError(profile(this.taro, "nobody"), "USER_NOT_FOUND");
		assertError(posts(this.taro, "nobody", null), "USER_NOT_FOUND");
	}

	// ---- その人の投稿の一覧（PF-2）----

	@Test
	void その人の投稿だけを新しい順に20件と1件で読める() {
		List<Long> ids = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			ids.add(createPost(this.taro, "投稿 " + i));
			createPost(this.hanako, "はなこの投稿 " + i);
		}

		MvcTestResult page1 = posts(this.hanako, "TARO_Y", null);
		List<Long> read = new ArrayList<>(ids(page1));
		assertThat(read).hasSize(20);
		MvcTestResult page2 = posts(this.hanako, "taro_y", JsonPath.read(content(page1), "$.nextCursor"));
		read.addAll(ids(page2));
		assertThat(page2).bodyJson().extractingPath("$.nextCursor").isNull();

		assertThat(read).containsExactlyElementsOf(ids.reversed());
		// タイムラインと同じ形。followingCount は返さない
		assertThat(page1).bodyJson().doesNotHavePath("$.followingCount");
		assertThat(page1).bodyJson().extractingPath("$.items[*].author.username").asArray().containsOnly("Taro_Y");
	}

	@Test
	void 投稿がなければ空の一覧() {
		assertThat(posts(this.taro, "hanako", null)).bodyJson().isStrictlyEqualTo("{\"items\":[],\"nextCursor\":null}");
	}

	@Test
	void 正しくないcursorは400() {
		MvcTestResult result = posts(this.taro, "taro_y", "abc");
		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo("CURSOR_INVALID");
	}

	// ---- 準備 ----

	private MvcTestResult profile(Cookie user, String username) {
		return this.mvc.get().uri("/api/users/{username}", username).cookie(user).exchange();
	}

	private MvcTestResult posts(Cookie user, String username, @Nullable String cursor) {
		var request = this.mvc.get().uri("/api/users/{username}/posts", username).cookie(user);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return request.exchange();
	}

	private void follow(Cookie user, String username) {
		assertThat(this.mvc.put().uri("/api/users/{username}/follow", username).with(csrf()).cookie(user).exchange())
			.hasStatus(HttpStatus.OK);
	}

	private long createPost(Cookie user, String body) {
		MvcTestResult result = this.mvc.post()
			.uri("/api/posts")
			.with(csrf())
			.cookie(user)
			.multipart()
			.param("body", body)
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
		return JsonPath.<Number>read(content(result), "$.id").longValue();
	}

	private static List<Long> ids(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.OK);
		List<Number> ids = JsonPath.read(content(result), "$.items[*].id");
		return ids.stream().map(Number::longValue).toList();
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
		assertThat(result).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
		assertThat(result).bodyJson().extractingPath("$.message").isEqualTo("このユーザーは見つかりません。");
	}

}
