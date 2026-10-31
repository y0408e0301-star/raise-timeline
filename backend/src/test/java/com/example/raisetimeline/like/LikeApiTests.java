package com.example.raisetimeline.like;

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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;
import com.example.raisetimeline.post.PostTestSupport;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

// いいねの API（機能定義書 FN-06）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class LikeApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	// 投稿者（users.id は 1）
	private Cookie taro;

	// users.id は 2
	private Cookie hanako;

	private long postId;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, likes, follows RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
		this.postId = createPost(this.taro, "今日は晴れ");
	}

	// ---- いいね・取り消し（L-1〜L-4）----

	@Test
	void いいねすると件数が増え取り消すと減る() {
		assertResult(like(this.hanako, this.postId), true, 1);
		assertResult(like(this.taro, this.postId), true, 2);
		assertResult(unlike(this.hanako, this.postId), false, 1);
		assertThat(likeRows()).isEqualTo(1);
	}

	// BR-6
	@Test
	void 重ねていいね_ない取り消しをしてもエラーにならず行は1つまで() {
		assertResult(like(this.hanako, this.postId), true, 1);
		assertResult(like(this.hanako, this.postId), true, 1);
		assertThat(likeRows()).isEqualTo(1);

		assertResult(unlike(this.hanako, this.postId), false, 0);
		assertResult(unlike(this.hanako, this.postId), false, 0);
		assertThat(likeRows()).isZero();
	}

	@Test
	void 自分の投稿にもいいねできる() {
		assertResult(like(this.taro, this.postId), true, 1);
	}

	@Test
	void 素早く10回押しても行は最後に押した状態と合う() {
		for (int i = 0; i < 10; i++) {
			MvcTestResult result = (i % 2 == 0) ? like(this.hanako, this.postId) : unlike(this.hanako, this.postId);
			assertThat(result).hasStatus(HttpStatus.OK);
		}
		// 10 回目は取り消し
		assertThat(likeRows()).isZero();
		like(this.hanako, this.postId);
		assertThat(likeRows()).isEqualTo(1);
	}

	@Test
	void 同じ人が同時にいいねしても行は1つ() throws Exception {
		Callable<MvcTestResult> task = () -> like(this.hanako, this.postId);
		try (ExecutorService executor = Executors.newFixedThreadPool(4)) {
			List<Future<MvcTestResult>> results = executor.invokeAll(List.of(task, task, task, task));
			for (Future<MvcTestResult> result : results) {
				assertThat(result.get()).hasStatus(HttpStatus.OK);
			}
		}
		assertThat(likeRows()).isEqualTo(1);
	}

	@Test
	void ない投稿へのいいね_取り消し_一覧は404() {
		deletePost(this.taro, this.postId);

		assertError(like(this.hanako, this.postId), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
		assertError(unlike(this.hanako, this.postId), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
		assertError(likers(this.hanako, this.postId, null), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
	}

	@Test
	void CSRFトークンのない送信はいいねできない() {
		MvcTestResult result = this.mvc.put().uri("/api/posts/{id}/like", this.postId).cookie(this.hanako).exchange();
		assertThat(result).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(likeRows()).isZero();
	}

	@Test
	void いいねしてから投稿を削除するといいねの行も消える() {
		like(this.hanako, this.postId);
		long other = createPost(this.hanako, "残る投稿");
		like(this.taro, other);

		deletePost(this.taro, this.postId);
		assertThat(likeRows()).isEqualTo(1);
	}

	// ---- PostView（L-6）----

	@Test
	void PostViewのいいね数とlikedByMeは見る人ごとに決まる() {
		long other = createPost(this.hanako, "はなこの投稿");
		like(this.hanako, this.postId);
		like(this.taro, this.postId);
		like(this.hanako, other);

		assertThat(timeline(this.taro)).bodyJson().isLenientlyEqualTo("""
				{"items":[
				  {"id":%d,"likeCount":1,"likedByMe":false},
				  {"id":%d,"likeCount":2,"likedByMe":true}
				]}
				""".formatted(other, this.postId));
		assertThat(this.mvc.get().uri("/api/posts/{id}", other).cookie(this.hanako).exchange()).bodyJson()
			.isLenientlyEqualTo("{\"likeCount\":1,\"likedByMe\":true}");
	}

	// ---- いいねした人の一覧（L-5）----

	@Test
	void いいねした人21人は新しい順に20人と1人で読めて件数は21() {
		List<String> usernames = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			String username = "user" + i;
			like(PostTestSupport.signup(this.mvc, username, "利用者 " + i), this.postId);
			usernames.add(username);
			this.clock.advance(Duration.ofSeconds(1));
		}

		// 投稿者でもいいねした人でもない人（hanako）が見る
		MvcTestResult page1 = likers(this.hanako, this.postId, null);
		List<String> read = new ArrayList<>(usernames(page1));
		assertThat(read).hasSize(20);
		assertThat(page1).bodyJson().extractingPath("$.totalCount").isEqualTo(21);

		MvcTestResult page2 = likers(this.hanako, this.postId, JsonPath.read(content(page1), "$.nextCursor"));
		read.addAll(usernames(page2));
		assertThat(page2).bodyJson().extractingPath("$.nextCursor").isNull();

		assertThat(read).containsExactlyElementsOf(usernames.reversed());
	}

	@Test
	void 同じ日時のいいねはuser_idの大きい順で続きにも重複と抜けが出ない() {
		// 時計を進めないので、全員が同じ日時にいいねする
		List<String> usernames = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			String username = "same" + i;
			like(PostTestSupport.signup(this.mvc, username, "同時 " + i), this.postId);
			usernames.add(username);
		}

		MvcTestResult page1 = likers(this.taro, this.postId, null);
		List<String> read = new ArrayList<>(usernames(page1));
		read.addAll(usernames(likers(this.taro, this.postId, JsonPath.read(content(page1), "$.nextCursor"))));
		assertThat(read).containsExactlyElementsOf(usernames.reversed());
	}

	@Test
	void いいねした人はUserSummaryの形でフォローしているかと自分かが分かる() {
		this.jdbc.update("UPDATE users SET bio = ? WHERE id = 2", "1 行目\n2 行目");
		this.jdbc.update("INSERT INTO follows (follower_id, followee_id) VALUES (1, 2)");
		like(this.taro, this.postId);
		this.clock.advance(Duration.ofSeconds(1));
		like(this.hanako, this.postId);

		assertThat(likers(this.taro, this.postId, null)).bodyJson().isLenientlyEqualTo("""
				{
				  "items": [
				    {"username":"hanako","displayName":"はなこ","bioFirstLine":"1 行目","iconUrl":null,
				     "followedByMe":true,"me":false},
				    {"username":"taro_y","displayName":"たろう","bioFirstLine":"","followedByMe":false,"me":true}
				  ],
				  "nextCursor": null,
				  "totalCount": 2
				}
				""");
	}

	@Test
	void 正しくないcursorは400() {
		assertError(likers(this.taro, this.postId, "abc"), HttpStatus.BAD_REQUEST, "CURSOR_INVALID");
		assertError(likers(this.taro, this.postId, "123"), HttpStatus.BAD_REQUEST, "CURSOR_INVALID");
	}

	// ---- 準備 ----

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

	private void deletePost(Cookie user, long id) {
		assertThat(this.mvc.delete().uri("/api/posts/{id}", id).with(csrf()).cookie(user).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
	}

	private MvcTestResult timeline(Cookie user) {
		return this.mvc.get().uri("/api/timeline").param("tab", "all").cookie(user).exchange();
	}

	private MvcTestResult like(Cookie user, long postId) {
		return this.mvc.put().uri("/api/posts/{id}/like", postId).with(csrf()).cookie(user).exchange();
	}

	private MvcTestResult unlike(Cookie user, long postId) {
		return this.mvc.delete().uri("/api/posts/{id}/like", postId).with(csrf()).cookie(user).exchange();
	}

	private MvcTestResult likers(Cookie user, long postId, @Nullable String cursor) {
		var request = this.mvc.get().uri("/api/posts/{id}/likes", postId).cookie(user);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return request.exchange();
	}

	private int likeRows() {
		Integer count = this.jdbc.queryForObject("SELECT count(*) FROM likes", Integer.class);
		return (count == null) ? 0 : count;
	}

	private static void assertResult(MvcTestResult result, boolean liked, int likeCount) {
		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().isStrictlyEqualTo("{\"liked\":" + liked + ",\"likeCount\":" + likeCount + "}");
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
