package com.example.raisetimeline.comment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

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

// コメントの API（機能定義書 FN-05）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class CommentApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	// 投稿者
	private Cookie taro;

	// コメントする人
	private Cookie hanako;

	// 投稿者でもコメントした人でもない人
	private Cookie jiro;

	private long postId;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, comments RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
		this.jiro = PostTestSupport.signup(this.mvc, "jiro", "じろう");
		this.postId = createPost(this.taro, "今日は晴れ");
	}

	// ---- コメントする（C-1・C-2）----

	@Test
	void コメントすると201でCommentの形が返る() {
		MvcTestResult result = comment(this.hanako, this.postId, "いい天気ですね");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{
				  "author": {"username":"hanako","displayName":"はなこ","iconUrl":null},
				  "body": "いい天気ですね",
				  "mine": true
				}
				""");
		assertThat(result).bodyJson().extractingPath("$.id").isNotNull();
		assertThat(Instant.parse(JsonPath.read(content(result), "$.createdAt"))).isEqualTo(this.clock.instant());
	}

	@Test
	void 本文は前後の空白を取り除き改行をLFにそろえて保存する() {
		MvcTestResult result = comment(this.hanako, this.postId, "  一行目\\r\\n二行目  ");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.body").isEqualTo("一行目\n二行目");
	}

	@Test
	void 本文280文字はコメントできて281文字と空白だけは400() {
		assertThat(comment(this.hanako, this.postId, "あ".repeat(280))).hasStatus(HttpStatus.CREATED);
		// 絵文字（サロゲートペア）も 1 文字と数える
		assertThat(comment(this.hanako, this.postId, "😀".repeat(280))).hasStatus(HttpStatus.CREATED);

		assertError(comment(this.hanako, this.postId, "あ".repeat(281)), HttpStatus.BAD_REQUEST, "COMMENT_INVALID");
		assertError(comment(this.hanako, this.postId, "   \\n  "), HttpStatus.BAD_REQUEST, "COMMENT_INVALID");
		assertError(this.mvc.post()
			.uri("/api/posts/{id}/comments", this.postId)
			.with(csrf())
			.cookie(this.hanako)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")
			.exchange(), HttpStatus.BAD_REQUEST, "COMMENT_INVALID");
		assertThat(commentRows()).isEqualTo(2);
	}

	@Test
	void ない投稿へのコメントと一覧は404() {
		deletePost(this.taro, this.postId);

		assertError(comment(this.hanako, this.postId, "こんにちは"), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
		assertError(list(this.hanako, this.postId, null), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
	}

	@Test
	void ログインしていない人とCSRFトークンのない送信はコメントできない() {
		MvcTestResult noLogin = this.mvc.post()
			.uri("/api/posts/{id}/comments", this.postId)
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"こんにちは\"}")
			.exchange();
		assertThat(noLogin).hasStatus(HttpStatus.UNAUTHORIZED);

		MvcTestResult noCsrf = this.mvc.post()
			.uri("/api/posts/{id}/comments", this.postId)
			.cookie(this.hanako)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"こんにちは\"}")
			.exchange();
		assertThat(noCsrf).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(commentRows()).isZero();
	}

	// ---- 一覧（C-3・C-4・C-6）----

	@Test
	void コメント51件は古い順に50件と1件で読めて最後のnextCursorはnull() {
		List<Long> created = IntStream.range(0, 51)
			.mapToObj((i) -> id(comment(this.hanako, this.postId, "コメント " + i)))
			.toList();

		MvcTestResult page1 = list(this.jiro, this.postId, null);
		List<Long> read = new ArrayList<>(ids(page1));
		assertThat(read).hasSize(50);
		String cursor = JsonPath.read(content(page1), "$.nextCursor");
		assertThat(cursor).isEqualTo(String.valueOf(read.getLast()));

		MvcTestResult page2 = list(this.jiro, this.postId, cursor);
		read.addAll(ids(page2));
		assertThat(page2).bodyJson().extractingPath("$.nextCursor").isNull();

		assertThat(read).containsExactlyElementsOf(created);
	}

	@Test
	void 続きを読む前にコメントが増えても重複も抜けも出ない() {
		IntStream.range(0, 51).forEach((i) -> comment(this.hanako, this.postId, "コメント " + i));
		MvcTestResult page1 = list(this.taro, this.postId, null);
		long added = id(comment(this.taro, this.postId, "後から"));

		List<Long> page2 = ids(list(this.taro, this.postId, JsonPath.read(content(page1), "$.nextCursor")));
		assertThat(page2).hasSize(2).endsWith(added).doesNotContainAnyElementsOf(ids(page1));
	}

	@Test
	void 第三者もコメントの中身と件数を見られてmineは自分のコメントだけtrue() {
		comment(this.hanako, this.postId, "はなこのコメント");
		comment(this.jiro, this.postId, "じろうのコメント");

		assertThat(list(this.jiro, this.postId, null)).bodyJson().isLenientlyEqualTo("""
				{
				  "items": [
				    {"author":{"username":"hanako","displayName":"はなこ"},"body":"はなこのコメント","mine":false},
				    {"author":{"username":"jiro","displayName":"じろう"},"body":"じろうのコメント","mine":true}
				  ],
				  "nextCursor": null
				}
				""");
		assertThat(getPost(this.jiro, this.postId)).bodyJson().extractingPath("$.commentCount").isEqualTo(2);
	}

	@Test
	void タイムラインのコメント数は投稿ごとに数える() {
		long other = createPost(this.hanako, "はなこの投稿");
		comment(this.jiro, this.postId, "1");
		comment(this.jiro, this.postId, "2");
		comment(this.jiro, other, "3");
		long none = createPost(this.jiro, "コメントなし");

		MvcTestResult result = this.mvc.get().uri("/api/timeline").param("tab", "all").cookie(this.taro).exchange();
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"items":[
				  {"id":%d,"commentCount":0},
				  {"id":%d,"commentCount":1},
				  {"id":%d,"commentCount":2}
				]}
				""".formatted(none, other, this.postId));
	}

	@Test
	void 正しくないcursorは400() {
		assertError(list(this.taro, this.postId, "abc"), HttpStatus.BAD_REQUEST, "CURSOR_INVALID");
	}

	// ---- 削除（C-5）----

	@Test
	void 自分のコメントは削除できて2回目は404() {
		long commentId = id(comment(this.hanako, this.postId, "消すコメント"));

		assertThat(delete(this.hanako, commentId)).hasStatus(HttpStatus.NO_CONTENT);
		assertThat(ids(list(this.taro, this.postId, null))).isEmpty();
		assertThat(getPost(this.taro, this.postId)).bodyJson().extractingPath("$.commentCount").isEqualTo(0);

		assertError(delete(this.hanako, commentId), HttpStatus.NOT_FOUND, "COMMENT_NOT_FOUND");
	}

	@Test
	void 投稿者でもほかの人のコメントを削除しようとすると403で消えない() {
		long commentId = id(comment(this.hanako, this.postId, "はなこのコメント"));

		assertError(delete(this.taro, commentId), HttpStatus.FORBIDDEN, "FORBIDDEN");
		assertError(delete(this.jiro, commentId), HttpStatus.FORBIDDEN, "FORBIDDEN");
		assertThat(commentRows()).isEqualTo(1);
	}

	@Test
	void 投稿を削除するとコメントもすべて消える() {
		comment(this.hanako, this.postId, "1");
		comment(this.jiro, this.postId, "2");
		long other = createPost(this.hanako, "残る投稿");
		comment(this.taro, other, "残るコメント");

		deletePost(this.taro, this.postId);
		assertThat(commentRows()).isEqualTo(1);
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
		return id(result);
	}

	private void deletePost(Cookie user, long id) {
		assertThat(this.mvc.delete().uri("/api/posts/{id}", id).with(csrf()).cookie(user).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
	}

	private MvcTestResult getPost(Cookie user, long id) {
		return this.mvc.get().uri("/api/posts/{id}", id).cookie(user).exchange();
	}

	// body は JSON の文字列の中身として、そのまま埋め込む（\n などはエスケープしたものを渡す）
	private MvcTestResult comment(Cookie user, long postId, String body) {
		return this.mvc.post()
			.uri("/api/posts/{id}/comments", postId)
			.with(csrf())
			.cookie(user)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"" + body + "\"}")
			.exchange();
	}

	private MvcTestResult list(Cookie user, long postId, @Nullable String cursor) {
		var request = this.mvc.get().uri("/api/posts/{id}/comments", postId).cookie(user);
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return request.exchange();
	}

	private MvcTestResult delete(Cookie user, long commentId) {
		return this.mvc.delete().uri("/api/comments/{id}", commentId).with(csrf()).cookie(user).exchange();
	}

	private int commentRows() {
		Integer count = this.jdbc.queryForObject("SELECT count(*) FROM comments", Integer.class);
		return (count == null) ? 0 : count;
	}

	private static long id(MvcTestResult result) {
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

	private static void assertError(MvcTestResult result, HttpStatus status, String code) {
		assertThat(result).hasStatus(status);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
		assertThat(result).bodyJson().extractingPath("$.message").asString().isNotEmpty();
	}

}
