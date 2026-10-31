package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
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

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

// タイムラインの API（機能定義書 FN-02）を、API を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの。
// フォローする操作（FN-07）はまだないので、follows には直接入れる
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class TimelineApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	// users.id は登録した順に 1・2・3
	private Cookie taro;

	private Cookie hanako;

	private Cookie jiro;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, follows RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.taro = signup("taro_y", "たろう");
		this.hanako = signup("hanako", "はなこ");
		this.jiro = signup("jiro", "じろう");
	}

	// ---- どの投稿を出すか（T-1）----

	// TC-02-1
	@Test
	void フォロー中には自分とフォローしている人の投稿だけが新しい順に出る() {
		follow(1, 2);
		long mine = id(create(this.taro, "たろう"));
		long followed = id(create(this.hanako, "はなこ"));
		create(this.jiro, "じろう");

		MvcTestResult result = timeline(this.taro, "following", null);
		assertThat(ids(result)).containsExactly(followed, mine);
		assertThat(result).bodyJson().extractingPath("$.nextCursor").isNull();
		assertThat(result).bodyJson().extractingPath("$.followingCount").isEqualTo(1);
	}

	// TC-02-2
	@Test
	void すべてには全員の投稿が新しい順にPostViewの形で出る() {
		long first = id(create(this.taro, "たろう"));
		long second = id(create(this.hanako, "はなこ"));
		long third = id(create(this.jiro, "じろう"));

		MvcTestResult result = timeline(this.taro, "all", null);
		assertThat(ids(result)).containsExactly(third, second, first);
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{
				  "items": [
				    {"author":{"username":"jiro","displayName":"じろう","iconUrl":null},"body":"じろう","mine":false},
				    {"author":{"username":"hanako"},"mine":false},
				    {"author":{"username":"taro_y"},"mine":true,"images":[],"likeCount":0,"commentCount":0}
				  ],
				  "nextCursor": null
				}
				""");
		// followingCount は「フォロー中」の最初の 20 件のときだけ返す
		assertThat(result).bodyJson().doesNotHavePath("$.followingCount");
	}

	// TC-02-6
	@Test
	void 誰もフォローしておらず自分の投稿もないとフォロー中は空でフォロー数は0() {
		create(this.hanako, "はなこ");

		MvcTestResult result = timeline(this.taro, "following", null);
		assertThat(ids(result)).isEmpty();
		assertThat(result).bodyJson().extractingPath("$.followingCount").isEqualTo(0);
	}

	@Test
	void フォローを外すと次に読み込んだときから出ない() {
		follow(1, 2);
		create(this.hanako, "はなこ");
		assertThat(ids(timeline(this.taro, "following", null))).hasSize(1);

		this.jdbc.update("DELETE FROM follows WHERE follower_id = 1 AND followee_id = 2");
		assertThat(ids(timeline(this.taro, "following", null))).isEmpty();
	}

	// ---- 20 件ずつ（T-2・T-7）----

	// TC-02-3
	@Test
	void 投稿41件は20件と20件と1件で読めて最後のnextCursorはnull() {
		List<Long> created = createMany(this.hanako, 41);

		MvcTestResult page1 = timeline(this.taro, "all", null);
		List<Long> read = new ArrayList<>(ids(page1));
		assertThat(read).hasSize(20);
		assertThat(nextCursor(page1)).isEqualTo(String.valueOf(read.getLast()));

		MvcTestResult page2 = timeline(this.taro, "all", nextCursor(page1));
		assertThat(ids(page2)).hasSize(20);
		read.addAll(ids(page2));

		MvcTestResult page3 = timeline(this.taro, "all", nextCursor(page2));
		assertThat(ids(page3)).hasSize(1);
		read.addAll(ids(page3));
		assertThat(page3).bodyJson().extractingPath("$.nextCursor").isNull();

		assertThat(read).containsExactlyElementsOf(created.reversed());
	}

	@Test
	void ちょうど20件ならnextCursorはnull() {
		createMany(this.taro, 20);

		MvcTestResult result = timeline(this.taro, "following", null);
		assertThat(ids(result)).hasSize(20);
		assertThat(result).bodyJson().extractingPath("$.nextCursor").isNull();
	}

	// TC-02-4
	@Test
	void 最初の20件を読んだ後にほかの人が投稿しても続きに重複も抜けもない() {
		List<Long> created = createMany(this.hanako, 25);
		MvcTestResult page1 = timeline(this.taro, "all", null);
		createMany(this.jiro, 3);

		List<Long> read = new ArrayList<>(ids(page1));
		read.addAll(ids(timeline(this.taro, "all", nextCursor(page1))));
		assertThat(read).containsExactlyElementsOf(created.reversed());
	}

	@Test
	void フォロー中も続きを読める() {
		follow(1, 2);
		List<Long> shown = new ArrayList<>();
		for (int i = 0; i < 15; i++) {
			shown.add(id(create(this.taro, "たろう " + i)));
			shown.add(id(create(this.hanako, "はなこ " + i)));
			create(this.jiro, "じろう " + i);
		}

		MvcTestResult page1 = timeline(this.taro, "following", null);
		List<Long> read = new ArrayList<>(ids(page1));
		MvcTestResult page2 = timeline(this.taro, "following", nextCursor(page1));
		read.addAll(ids(page2));
		assertThat(read).containsExactlyElementsOf(shown.reversed());
		assertThat(page2).bodyJson().extractingPath("$.nextCursor").isNull();
		assertThat(page2).bodyJson().doesNotHavePath("$.followingCount");
	}

	// ---- 入力の確認（4 章）・権限（8 章）----

	@Test
	void tabがないか正しくないと400のTAB_INVALID() {
		assertError(timeline(this.taro, null, null), "TAB_INVALID");
		assertError(timeline(this.taro, "mine", null), "TAB_INVALID");
	}

	@Test
	void cursorが数字だけでないと400のCURSOR_INVALID() {
		assertError(timeline(this.taro, "all", "abc"), "CURSOR_INVALID");
		assertError(timeline(this.taro, "all", "-1"), "CURSOR_INVALID");
		assertError(timeline(this.taro, "all", ""), "CURSOR_INVALID");
		assertError(timeline(this.taro, "all", "99999999999999999999"), "CURSOR_INVALID");
	}

	@Test
	void ログインしていないと401() {
		assertThat(this.mvc.get().uri("/api/timeline?tab=all").exchange()).hasStatus(HttpStatus.UNAUTHORIZED);
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

	private void follow(long followerId, long followeeId) {
		this.jdbc.update("INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", followerId, followeeId);
	}

	private MvcTestResult create(Cookie user, String body) {
		return this.mvc.post().uri("/api/posts").with(csrf()).cookie(user).multipart().param("body", body).exchange();
	}

	private List<Long> createMany(Cookie user, int count) {
		return IntStream.range(0, count).mapToObj((i) -> id(create(user, "投稿 " + i))).toList();
	}

	private MvcTestResult timeline(Cookie user, @Nullable String tab, @Nullable String cursor) {
		var request = this.mvc.get().uri("/api/timeline").cookie(user);
		if (tab != null) {
			request = request.param("tab", tab);
		}
		if (cursor != null) {
			request = request.param("cursor", cursor);
		}
		return request.exchange();
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

	private static String nextCursor(MvcTestResult result) {
		String cursor = JsonPath.read(content(result), "$.nextCursor");
		assertThat(cursor).isNotNull();
		return cursor;
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
