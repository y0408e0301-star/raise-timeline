package com.example.raisetimeline.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.testcontainers.containers.MinIOContainer;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;
import com.example.raisetimeline.post.ImageApiTests;
import com.example.raisetimeline.post.PostTestSupport;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.S3Object;

// プロフィールの編集（機能定義書 FN-09 第 2 版、PF-5〜PF-10）を、API とテスト用の S3（MinIO）を通して確かめる。
// 10 章の「テストの観点」のうち、サーバー側で確かめられるもの。S3 やデータベースへの保存に失敗するときの観点は ProfileIconFailureTests
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class ProfileEditApiTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	MinIOContainer minio;

	private S3Client s3;

	// users.id は 1
	private Cookie taro;

	// users.id は 2
	private Cookie hanako;

	@BeforeEach
	void setUp() {
		this.jdbc.execute(
				"TRUNCATE users, refresh_tokens, posts, likes, comments, follows, storage_deletions RESTART IDENTITY CASCADE");
		this.s3 = TestcontainersConfiguration.s3Client(this.minio);
		ImageApiTests.emptyBucket(this.s3);
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
	}

	@AfterEach
	void tearDown() {
		this.s3.close();
	}

	// ---- 表示名・自己紹介（PF-5〜PF-7）----

	@Test
	void 表示名と自己紹介を変えると新しいプロフィールを返し過去の投稿とコメントにも新しい表示名が出る() {
		long postId = createPost(this.taro, "前に書いた投稿");
		this.mvc.post()
			.uri("/api/posts/{id}/comments", postId)
			.with(csrf())
			.cookie(this.taro)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"前に書いたコメント\"}")
			.exchange();

		MvcTestResult result = edit(this.taro, "{\"displayName\":\"  たろう（新） \",\"bio\":\" 1 行目\\r\\n2 行目 \"}");
		assertThat(result).hasStatus(HttpStatus.OK)
			.bodyJson()
			.isLenientlyEqualTo(
					"{\"username\":\"taro_y\",\"displayName\":\"たろう（新）\",\"bio\":\"1 行目\\n2 行目\",\"me\":true}");

		assertThat(this.mvc.get().uri("/api/posts/{id}", postId).cookie(this.hanako).exchange()).bodyJson()
			.extractingPath("$.author.displayName")
			.isEqualTo("たろう（新）");
		assertThat(this.mvc.get().uri("/api/posts/{id}/comments", postId).cookie(this.hanako).exchange()).bodyJson()
			.extractingPath("$.items[0].author.displayName")
			.isEqualTo("たろう（新）");
		assertThat(this.mvc.get().uri("/api/auth/me").cookie(this.taro).exchange()).bodyJson()
			.extractingPath("$.displayName")
			.isEqualTo("たろう（新）");
	}

	@Test
	void 自己紹介は160文字まで保存でき161文字は400のBIO_TOO_LONG() {
		// 絵文字は 1 文字（コードポイント）と数える
		String bio160 = "😀".repeat(160);
		assertThat(edit(this.taro, "{\"displayName\":\"たろう\",\"bio\":\"" + bio160 + "\"}")).hasStatus(HttpStatus.OK)
			.bodyJson()
			.extractingPath("$.bio")
			.isEqualTo(bio160);

		assertError(edit(this.taro, "{\"displayName\":\"たろう\",\"bio\":\"" + bio160 + "a\"}"), HttpStatus.BAD_REQUEST,
				"BIO_TOO_LONG");
		assertThat(this.jdbc.queryForObject("SELECT bio FROM users WHERE id = 1", String.class)).isEqualTo(bio160);
	}

	@Test
	void 自己紹介は空にできる() {
		edit(this.taro, "{\"displayName\":\"たろう\",\"bio\":\"自己紹介\"}");
		assertThat(edit(this.taro, "{\"displayName\":\"たろう\",\"bio\":\"\"}")).bodyJson()
			.extractingPath("$.bio")
			.isEqualTo("");
	}

	@Test
	void 表示名が空なら400のDISPLAY_NAME_REQUIREDで31文字なら400() {
		assertError(edit(this.taro, "{\"displayName\":\"   \",\"bio\":\"\"}"), HttpStatus.BAD_REQUEST,
				"DISPLAY_NAME_REQUIRED");
		assertError(edit(this.taro, "{\"displayName\":\"" + "あ".repeat(31) + "\",\"bio\":\"\"}"),
				HttpStatus.BAD_REQUEST, "BAD_REQUEST");
		assertThat(edit(this.taro, "{\"displayName\":\"" + "あ".repeat(30) + "\",\"bio\":\"\"}"))
			.hasStatus(HttpStatus.OK);
	}

	@Test
	void 変えられるのは自分のプロフィールだけ() {
		// ユーザー ID を送っても使わない（URL にも本文にも、ほかの人を指定する入力がない）
		edit(this.hanako, "{\"username\":\"taro_y\",\"displayName\":\"のっとり\",\"bio\":\"\"}");
		assertThat(this.jdbc.queryForList("SELECT display_name FROM users ORDER BY id", String.class))
			.containsExactly("たろう", "のっとり");
	}

	@Test
	void ログインしていなければ401() {
		assertThat(this.mvc.patch()
			.uri("/api/me/profile")
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"displayName\":\"たろう\",\"bio\":\"\"}")
			.exchange()).hasStatus(HttpStatus.UNAUTHORIZED);
		assertThat(this.mvc.put()
			.uri("/api/me/icon")
			.with(csrf())
			.multipart()
			.file(icon(ImageApiTests.png(10)))
			.exchange()).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	// ---- アイコン画像（PF-8〜PF-10）----

	// N-8
	@Test
	void 五MBちょうどのJPEGとPNGとWebPをアイコンにでき前のアイコンはS3から消える() throws Exception {
		int head = 12;
		for (byte[] data : List.of(ImageApiTests.jpeg(ImageApiTests.FIVE_MB - 3),
				ImageApiTests.png(ImageApiTests.FIVE_MB - 8), ImageApiTests.webp(ImageApiTests.FIVE_MB - 16))) {
			assertThat(data).hasSize(ImageApiTests.FIVE_MB);
			MvcTestResult result = changeIcon(this.taro, data);
			assertThat(result).hasStatus(HttpStatus.OK);

			// S3 には今のアイコンだけが残る（BR-10）
			String key = iconKey(1);
			assertThat(ImageApiTests.objects(this.s3)).extracting(S3Object::key).containsExactly(key);
			assertThat(key).matches("icons/[0-9a-f-]{36}\\.(jpg|png|webp)");

			// 返した署名付き URL で、送った画像が読める
			String url = JsonPath.read(content(result), "$.iconUrl");
			var got = ImageApiTests.httpGet(url);
			assertThat(got.statusCode()).isEqualTo(200);
			assertThat(got.body()).startsWith(Arrays.copyOf(data, head));
		}
	}

	@Test
	void 五MBを超えるアイコンは413のICON_TOO_LARGE() {
		assertError(changeIcon(this.taro, ImageApiTests.png(ImageApiTests.FIVE_MB - 7)), HttpStatus.CONTENT_TOO_LARGE,
				"ICON_TOO_LARGE");
		assertNoIcon();
	}

	@Test
	void GIFと拡張子を変えたテキストと空のファイルは400のICON_TYPE_INVALID() {
		assertError(changeIcon(this.taro, ImageApiTests.gif(10)), HttpStatus.BAD_REQUEST, "ICON_TYPE_INVALID");
		assertError(changeIcon(this.taro, "PNG ではない".getBytes(StandardCharsets.UTF_8)), HttpStatus.BAD_REQUEST,
				"ICON_TYPE_INVALID");
		assertError(this.mvc.put().uri("/api/me/icon").with(csrf()).cookie(this.taro).multipart().exchange(),
				HttpStatus.BAD_REQUEST, "ICON_TYPE_INVALID");
		assertNoIcon();
	}

	@Test
	void アイコンを設定するとプロフィールと投稿とコメントとユーザーの行と自分の情報にURLが入る() {
		long postId = createPost(this.taro, "投稿");
		this.mvc.post()
			.uri("/api/posts/{id}/comments", postId)
			.with(csrf())
			.cookie(this.taro)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"コメント\"}")
			.exchange();
		this.mvc.put().uri("/api/posts/{id}/like", postId).with(csrf()).cookie(this.taro).exchange();
		this.mvc.put().uri("/api/users/hanako/follow").with(csrf()).cookie(this.taro).exchange();
		assertThat(this.mvc.get().uri("/api/posts/{id}", postId).cookie(this.hanako).exchange()).bodyJson()
			.extractingPath("$.author.iconUrl")
			.isNull();

		assertThat(changeIcon(this.taro, ImageApiTests.png(10))).hasStatus(HttpStatus.OK);

		String key = iconKey(1);
		assertIconUrl(this.mvc.get().uri("/api/users/taro_y").cookie(this.hanako).exchange(), "$.iconUrl", key);
		assertIconUrl(this.mvc.get().uri("/api/auth/me").cookie(this.taro).exchange(), "$.iconUrl", key);
		assertIconUrl(this.mvc.get().uri("/api/posts/{id}", postId).cookie(this.hanako).exchange(), "$.author.iconUrl",
				key);
		assertIconUrl(this.mvc.get().uri("/api/timeline?tab=all").cookie(this.hanako).exchange(),
				"$.items[0].author.iconUrl", key);
		assertIconUrl(this.mvc.get().uri("/api/posts/{id}/comments", postId).cookie(this.hanako).exchange(),
				"$.items[0].author.iconUrl", key);
		assertIconUrl(this.mvc.get().uri("/api/posts/{id}/likes", postId).cookie(this.hanako).exchange(),
				"$.items[0].iconUrl", key);
		assertIconUrl(this.mvc.get().uri("/api/users/hanako/followers").cookie(this.hanako).exchange(),
				"$.items[0].iconUrl", key);
	}

	@Test
	void アイコンを外すと204でURLがなくなりS3のファイルも消える() {
		changeIcon(this.taro, ImageApiTests.png(10));
		assertThat(ImageApiTests.objects(this.s3)).hasSize(1);

		assertThat(this.mvc.delete().uri("/api/me/icon").with(csrf()).cookie(this.taro).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		assertNoIcon();
		assertThat(this.mvc.get().uri("/api/users/taro_y").cookie(this.taro).exchange()).bodyJson()
			.extractingPath("$.iconUrl")
			.isNull();

		// 設定していないときに外しても 204
		assertThat(this.mvc.delete().uri("/api/me/icon").with(csrf()).cookie(this.taro).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
	}

	// N-14
	@Test
	void バケットのiconsのURLを署名なしで開いてもアイコンは見られない() throws Exception {
		changeIcon(this.taro, ImageApiTests.png(10));
		var got = ImageApiTests
			.httpGet(this.minio.getS3URL() + "/" + TestcontainersConfiguration.BUCKET + "/" + iconKey(1));
		assertThat(got.statusCode()).isEqualTo(403);
	}

	private MvcTestResult edit(Cookie user, String json) {
		return this.mvc.patch()
			.uri("/api/me/profile")
			.with(csrf())
			.cookie(user)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private MvcTestResult changeIcon(Cookie user, byte[] data) {
		return this.mvc.put().uri("/api/me/icon").with(csrf()).cookie(user).multipart().file(icon(data)).exchange();
	}

	// 送るファイル名・Content-Type はわざとでたらめにする（API はファイルの中身で形式を決める）
	private static MockMultipartFile icon(byte[] data) {
		return new MockMultipartFile("icon", "icon.png", "application/octet-stream", data);
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

	private String iconKey(long userId) {
		return this.jdbc.queryForObject("SELECT icon_key FROM users WHERE id = ?", String.class, userId);
	}

	private void assertNoIcon() {
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM users WHERE icon_key IS NOT NULL", Long.class))
			.isZero();
		assertThat(ImageApiTests.objects(this.s3)).isEmpty();
	}

	// 署名付き URL は、そのキーを指している
	private static void assertIconUrl(MvcTestResult result, String path, String key) {
		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath(path).asString().contains("/" + key + "?");
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
