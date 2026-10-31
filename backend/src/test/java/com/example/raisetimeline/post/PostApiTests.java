package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
import java.time.Duration;

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

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

// 投稿の API（機能定義書 FN-03）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの。
// 画像（FN-04）・コメント（FN-05）・いいね（FN-06）と一緒の観点は、それぞれの機能を作るときに足す
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class PostApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	private Cookie taro;

	private Cookie hanako;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.taro = signup("taro_y", "たろう");
		this.hanako = signup("hanako", "はなこ");
	}

	// ---- 投稿（W-1〜W-5）----

	// TC-03-1
	@Test
	void 投稿すると前後の空白を取り除いた本文で保存されPostViewが返る() {
		MvcTestResult result = create(this.taro, "  \n今日は晴れ。\n川沿いを散歩してきた　\n ");
		assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
				{
				  "id": 1,
				  "author": {"username":"taro_y","displayName":"たろう","iconUrl":null},
				  "body": "今日は晴れ。\\n川沿いを散歩してきた",
				  "images": [],
				  "likeCount": 0,
				  "commentCount": 0,
				  "likedByMe": false,
				  "mine": true,
				  "editedAt": null
				}
				""");
		assertThat(result).bodyJson().extractingPath("$.createdAt").isEqualTo(this.clock.instant().toString());
	}

	// TC-03-1
	@Test
	void 本文は280文字まで投稿でき281文字は投稿できない() {
		assertThat(create(this.taro, "あ".repeat(280))).hasStatus(HttpStatus.CREATED);
		assertThat(create(this.taro, "  " + "あ".repeat(280) + "\n")).hasStatus(HttpStatus.CREATED);
		assertError(create(this.taro, "あ".repeat(281)), HttpStatus.BAD_REQUEST, "BODY_TOO_LONG");
	}

	// TC-03-2
	@Test
	void 絵文字はコードポイントで数える() {
		// 🇯🇵（国旗）と 👍🏽（肌の色つき）は、どちらも 2 コードポイント・UTF-16 で 4 つ
		String flags = "🇯🇵".repeat(70) + "👍🏽".repeat(70);
		assertThat(create(this.taro, flags)).hasStatus(HttpStatus.CREATED)
			.bodyJson()
			.extractingPath("$.body")
			.isEqualTo(flags);
		assertError(create(this.taro, flags + "a"), HttpStatus.BAD_REQUEST, "BODY_TOO_LONG");
	}

	// TC-03-3
	@Test
	void 改行はLFにそろえて1文字と数える() {
		// ブラウザは multipart で送るときに改行を CRLF に変える。画面では改行 1 つを 1 文字と数えている
		String body = ("あ".repeat(9) + "\r\n").repeat(28);
		assertThat(create(this.taro, body)).hasStatus(HttpStatus.CREATED)
			.bodyJson()
			.extractingPath("$.body")
			.isEqualTo(("あ".repeat(9) + "\n").repeat(28).strip());
		assertThat(create(this.taro, "1 行目\r2 行目")).bodyJson().extractingPath("$.body").isEqualTo("1 行目\n2 行目");
	}

	// BR-2
	// TC-03-4
	@Test
	void 本文が空で画像もないときは投稿できない() {
		assertError(create(this.taro, ""), HttpStatus.BAD_REQUEST, "POST_EMPTY");
		assertError(create(this.taro, " \n　\t"), HttpStatus.BAD_REQUEST, "POST_EMPTY");
		assertError(this.mvc.post().uri("/api/posts").with(csrf()).cookie(this.taro).multipart().exchange(),
				HttpStatus.BAD_REQUEST, "POST_EMPTY");
	}

	// TC-03-5
	@Test
	void HTMLの記号はそのまま保存して返す() {
		assertThat(create(this.taro, "<script>alert(1)</script> & \"x\"")).bodyJson()
			.extractingPath("$.body")
			.isEqualTo("<script>alert(1)</script> & \"x\"");
	}

	@Test
	void ログインしていなければ投稿できずCSRFトークンがなければ403() {
		assertError(this.mvc.post().uri("/api/posts").with(csrf()).multipart().param("body", "本文").exchange(),
				HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
		assertError(this.mvc.post().uri("/api/posts").cookie(this.taro).multipart().param("body", "本文").exchange(),
				HttpStatus.FORBIDDEN, "FORBIDDEN");
	}

	// ---- 詳細（W-6・W-8）----

	@Test
	void 詳細は誰でも見られ自分の投稿かどうかが分かる() {
		long id = id(create(this.taro, "本文"));
		assertThat(get(this.taro, id)).hasStatusOk().bodyJson().extractingPath("$.mine").isEqualTo(true);
		assertThat(get(this.hanako, id)).hasStatusOk().bodyJson().isLenientlyEqualTo("""
				{"body":"本文","author":{"username":"taro_y"},"mine":false}
				""");
	}

	@Test
	void ない投稿は404() {
		assertError(get(this.taro, 999), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
	}

	// ---- 編集（W-9〜W-11）----

	// TC-03-12
	@Test
	void 編集すると本文と編集日時だけが変わる() {
		MvcTestResult created = create(this.taro, "前の本文");
		long id = id(created);
		String createdAt = this.clock.instant().toString();
		this.clock.advance(Duration.ofMinutes(5));

		MvcTestResult edited = edit(this.taro, id, "  新しい本文\n2 行目 ");
		assertThat(edited).hasStatusOk().bodyJson().isLenientlyEqualTo("""
				{"body":"新しい本文\\n2 行目","mine":true}
				""");
		assertThat(edited).bodyJson().extractingPath("$.createdAt").isEqualTo(createdAt);
		assertThat(edited).bodyJson().extractingPath("$.editedAt").isEqualTo(this.clock.instant().toString());
		assertThat(get(this.hanako, id)).bodyJson().extractingPath("$.body").isEqualTo("新しい本文\n2 行目");
	}

	// TC-03-10・TC-03-11
	@Test
	void 編集した本文も280文字までで画像のない投稿は空にできない() {
		long id = id(create(this.taro, "本文"));
		assertThat(edit(this.taro, id, "い".repeat(280))).hasStatusOk();
		assertError(edit(this.taro, id, "い".repeat(281)), HttpStatus.BAD_REQUEST, "BODY_TOO_LONG");
		assertError(edit(this.taro, id, "  "), HttpStatus.BAD_REQUEST, "POST_EMPTY");
		assertError(edit(this.taro, id, null), HttpStatus.BAD_REQUEST, "POST_EMPTY");
	}

	// BR-7
	// TC-03-14
	@Test
	void 他人の投稿は編集できず削除された投稿は404() {
		long id = id(create(this.taro, "本文"));
		assertError(edit(this.hanako, id, "書き換え"), HttpStatus.FORBIDDEN, "FORBIDDEN");
		assertThat(get(this.taro, id)).bodyJson().extractingPath("$.body").isEqualTo("本文");

		assertThat(delete(this.taro, id)).hasStatus(HttpStatus.NO_CONTENT);
		assertError(edit(this.taro, id, "書き換え"), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
	}

	// ---- 削除（W-7・W-8）----

	@Test
	void 削除すると詳細が404になる() {
		long id = id(create(this.taro, "本文"));
		assertThat(delete(this.taro, id)).hasStatus(HttpStatus.NO_CONTENT);
		assertError(get(this.taro, id), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
		assertError(delete(this.taro, id), HttpStatus.NOT_FOUND, "POST_NOT_FOUND");
	}

	// BR-7
	// TC-03-7
	@Test
	void 他人の投稿は削除できない() {
		long id = id(create(this.taro, "本文"));
		assertError(delete(this.hanako, id), HttpStatus.FORBIDDEN, "FORBIDDEN");
		assertThat(get(this.taro, id)).hasStatusOk();
	}

	@Test
	void 削除した投稿のIDは使い回さない() {
		long first = id(create(this.taro, "1 つ目"));
		delete(this.taro, first);
		assertThat(id(create(this.taro, "2 つ目"))).isGreaterThan(first);
	}

	// ---- ヘルパー ----

	private Cookie signup(String username, String displayName) {
		MvcTestResult result = this.mvc.post()
			.uri("/api/auth/signup")
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"" + username + "\",\"displayName\":\"" + displayName
					+ "\",\"password\":\"password1\"}")
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
		Cookie access = result.getResponse().getCookie("access_token");
		assertThat(access).isNotNull();
		return access;
	}

	private MvcTestResult create(Cookie user, String body) {
		return this.mvc.post().uri("/api/posts").with(csrf()).cookie(user).multipart().param("body", body).exchange();
	}

	private MvcTestResult get(Cookie user, long id) {
		return this.mvc.get().uri("/api/posts/{id}", id).cookie(user).exchange();
	}

	private MvcTestResult edit(Cookie user, long id, String body) {
		String json = (body == null) ? "{}" : "{\"body\":\"" + body.replace("\n", "\\n") + "\"}";
		return this.mvc.patch()
			.uri("/api/posts/{id}", id)
			.with(csrf())
			.cookie(user)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private MvcTestResult delete(Cookie user, long id) {
		return this.mvc.delete().uri("/api/posts/{id}", id).with(csrf()).cookie(user).exchange();
	}

	private static long id(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.CREATED);
		try {
			return JsonPath.<Number>read(result.getResponse().getContentAsString(), "$.id").longValue();
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
