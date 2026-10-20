package com.example.raisetimeline.follow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;
import com.example.raisetimeline.post.PostTestSupport;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

// フォローの API（機能定義書 FN-07）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class FollowApiTests {

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
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
	}

	// ---- フォロー・解除（F-1〜F-4）----

	@Test
	void フォローするとフォロワー数が増え外すと減る() {
		assertResult(follow(this.hanako, "taro_y"), true, 1);
		assertThat(followRows()).isEqualTo(1);
		assertResult(unfollow(this.hanako, "taro_y"), false, 0);
		assertThat(followRows()).isZero();
	}

	@Test
	void ユーザーIDは大文字小文字を区別しない() {
		assertResult(follow(this.hanako, "TARO_Y"), true, 1);
		assertResult(unfollow(this.hanako, "Taro_Y"), false, 0);
	}

	@Test
	void 重ねてフォロー_ない解除をしてもエラーにならず行は1つまで() {
		assertResult(follow(this.hanako, "taro_y"), true, 1);
		assertResult(follow(this.hanako, "taro_y"), true, 1);
		assertThat(followRows()).isEqualTo(1);

		assertResult(unfollow(this.hanako, "taro_y"), false, 0);
		assertResult(unfollow(this.hanako, "taro_y"), false, 0);
		assertThat(followRows()).isZero();
	}

	@Test
	void 素早く10回押しても行は最後に押した状態と合う() {
		for (int i = 0; i < 10; i++) {
			MvcTestResult result = (i % 2 == 0) ? follow(this.hanako, "taro_y") : unfollow(this.hanako, "taro_y");
			assertThat(result).hasStatus(HttpStatus.OK);
		}
		// 10 回目は解除
		assertThat(followRows()).isZero();
		follow(this.hanako, "taro_y");
		assertThat(followRows()).isEqualTo(1);
	}

	@Test
	void 同じ人を同時にフォローしても行は1つ() throws Exception {
		Callable<MvcTestResult> task = () -> follow(this.hanako, "taro_y");
		try (ExecutorService executor = Executors.newFixedThreadPool(4)) {
			List<Future<MvcTestResult>> results = executor.invokeAll(List.of(task, task, task, task));
			for (Future<MvcTestResult> result : results) {
				assertThat(result.get()).hasStatus(HttpStatus.OK);
			}
		}
		assertThat(followRows()).isEqualTo(1);
	}

	@Test
	void 自分はフォローできない() {
		assertError(follow(this.taro, "taro_y"), HttpStatus.BAD_REQUEST, "CANNOT_FOLLOW_SELF");
		assertError(follow(this.taro, "TARO_Y"), HttpStatus.BAD_REQUEST, "CANNOT_FOLLOW_SELF");
		assertThat(followRows()).isZero();
	}

	@Test
	void いないユーザーは404() {
		assertError(follow(this.taro, "nobody"), HttpStatus.NOT_FOUND, "USER_NOT_FOUND");
		assertError(unfollow(this.taro, "nobody"), HttpStatus.NOT_FOUND, "USER_NOT_FOUND");
		assertError(list(this.taro, "nobody", "following", null), HttpStatus.NOT_FOUND, "USER_NOT_FOUND");
		assertError(list(this.taro, "nobody", "followers", null), HttpStatus.NOT_FOUND, "USER_NOT_FOUND");
	}

	@Test
	void CSRFトークンのない送信はフォローできない() {
		MvcTestResult result = this.mvc.put().uri("/api/users/taro_y/follow").cookie(this.hanako).exchange();
		assertThat(result).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(followRows()).isZero();
	}

	@Test
	void 返すフォロワー数はほかの人のフォローも含めた最新の数() {
		Cookie jiro = PostTestSupport.signup(this.mvc, "jiro", "じろう");
		follow(jiro, "taro_y");
		assertResult(follow(this.hanako, "taro_y"), true, 2);
		assertResult(unfollow(this.hanako, "taro_y"), false, 1);
	}

	// ---- タイムラインの「フォロー中」（FN-02 との関係、F-7）----

	@Test
	void フォローすると相手の投稿がフォロー中に出て外すと出なくなる() {
		long postId = createPost(this.taro, "たろうの投稿");
		assertThat(followingTimeline(this.hanako)).isEmpty();

		follow(this.hanako, "taro_y");
		assertThat(followingTimeline(this.hanako)).containsExactly(postId);

		unfollow(this.hanako, "taro_y");
		assertThat(followingTimeline(this.hanako)).isEmpty();
	}

	@Test
	void フォローを外してもいいねとコメントは残る() {
		long postId = createPost(this.taro, "たろうの投稿");
		follow(this.hanako, "taro_y");
		assertThat(this.mvc.put().uri("/api/posts/{id}/like", postId).with(csrf()).cookie(this.hanako).exchange())
			.hasStatus(HttpStatus.OK);
		assertThat(this.mvc.post()
			.uri("/api/posts/{id}/comments", postId)
			.with(csrf())
			.cookie(this.hanako)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"いいですね\"}")
			.exchange()).hasStatus(HttpStatus.CREATED);

		unfollow(this.hanako, "taro_y");
		assertThat(this.mvc.get().uri("/api/posts/{id}", postId).cookie(this.hanako).exchange()).bodyJson()
			.isLenientlyEqualTo("{\"likeCount\":1,\"likedByMe\":true,\"commentCount\":1}");
	}

	// ---- フォロー中・フォロワーの一覧（F-6）----

	@Test
	void フォロー中とフォロワーを第三者が見られる() {
		this.jdbc.update("UPDATE users SET bio = ? WHERE id = 2", "1 行目\n2 行目");
		Cookie jiro = PostTestSupport.signup(this.mvc, "jiro", "じろう");
		follow(this.taro, "hanako");
		follow(jiro, "hanako");

		// jiro が見る。jiro は hanako をフォローしている
		assertThat(list(jiro, "taro_y", "following", null)).bodyJson().isStrictlyEqualTo("""
				{"items":[
				  {"username":"hanako","displayName":"はなこ","bioFirstLine":"1 行目","iconUrl":null,
				   "followedByMe":true,"me":false}
				],"nextCursor":null}
				""");
		assertThat(usernames(list(jiro, "hanako", "followers", null))).containsExactly("jiro", "taro_y");
		assertThat(list(jiro, "hanako", "followers", null)).bodyJson()
			.isLenientlyEqualTo(
					"{\"items\":[{\"username\":\"jiro\",\"me\":true},{\"username\":\"taro_y\",\"me\":false}]}");
		assertThat(usernames(list(jiro, "hanako", "following", null))).isEmpty();
	}

	@Test
	void フォロー中21人は新しくフォローした順に20人と1人で読める() {
		List<String> usernames = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			String username = "user" + i;
			PostTestSupport.signup(this.mvc, username, "利用者 " + i);
			follow(this.taro, username);
			usernames.add(username);
			this.clock.advance(Duration.ofSeconds(1));
		}

		MvcTestResult page1 = list(this.hanako, "taro_y", "following", null);
		List<String> read = new ArrayList<>(usernames(page1));
		assertThat(read).hasSize(20);
		MvcTestResult page2 = list(this.hanako, "taro_y", "following", JsonPath.read(content(page1), "$.nextCursor"));
		read.addAll(usernames(page2));
		assertThat(page2).bodyJson().extractingPath("$.nextCursor").isNull();

		assertThat(read).containsExactlyElementsOf(usernames.reversed());
	}

	@Test
	void 同じ日時のフォロワーは相手のIDの大きい順で続きにも重複と抜けが出ない() {
		// 時計を進めないので、全員が同じ日時にフォローする
		List<String> usernames = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			String username = "same" + i;
			follow(PostTestSupport.signup(this.mvc, username, "同時 " + i), "taro_y");
			usernames.add(username);
		}

		MvcTestResult page1 = list(this.hanako, "taro_y", "followers", null);
		List<String> read = new ArrayList<>(usernames(page1));
		read.addAll(usernames(list(this.hanako, "taro_y", "followers", JsonPath.read(content(page1), "$.nextCursor"))));
		assertThat(read).containsExactlyElementsOf(usernames.reversed());
	}

	@Test
	void 正しくないcursorは400() {
		assertError(list(this.taro, "taro_y", "following", "abc"), HttpStatus.BAD_REQUEST, "CURSOR_INVALID");
		assertError(list(this.taro, "taro_y", "followers", "123"), HttpStatus.BAD_REQUEST, "CURSOR_INVALID");
	}

	// ---- 準備 ----

	private MvcTestResult follow(Cookie user, String username) {
		return this.mvc.put().uri("/api/users/{username}/follow", username).with(csrf()).cookie(user).exchange();
	}

	private MvcTestResult unfollow(Cookie user, String username) {
		return this.mvc.delete().uri("/api/users/{username}/follow", username).with(csrf()).cookie(user).exchange();
	}

	// kind は following か followers
	private MvcTestResult list(Cookie user, String username, String kind, @Nullable String cursor) {
		var request = this.mvc.get().uri("/api/users/{username}/" + kind, username).cookie(user);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return request.exchange();
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

	private List<Long> followingTimeline(Cookie user) {
		MvcTestResult result = this.mvc.get().uri("/api/timeline").param("tab", "following").cookie(user).exchange();
		assertThat(result).hasStatus(HttpStatus.OK);
		List<Number> ids = JsonPath.read(content(result), "$.items[*].id");
		return ids.stream().map(Number::longValue).toList();
	}

	private int followRows() {
		Integer count = this.jdbc.queryForObject("SELECT count(*) FROM follows", Integer.class);
		return (count == null) ? 0 : count;
	}

	private static void assertResult(MvcTestResult result, boolean following, int followerCount) {
		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson()
			.isStrictlyEqualTo("{\"following\":" + following + ",\"followerCount\":" + followerCount + "}");
	}

	private static List<String> usernames(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.OK);
		return JsonPath.read(content(result), "$.items[*].username");
	}

	private static String content(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString();
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private static void assertError(MvcTestResult result, HttpStatus status, String code) {
		assertThat(result).hasStatus(status);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
		assertThat(result).bodyJson().extractingPath("$.message").asString().isNotEmpty();
	}

}
