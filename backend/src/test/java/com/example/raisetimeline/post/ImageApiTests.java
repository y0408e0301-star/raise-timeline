package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

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

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Object;

// 画像の API（機能定義書 FN-04）を、API とテスト用の S3（MinIO）を通して確かめる。10 章の「テストの観点」のうち、サーバー側で確かめられるもの。
// S3 やデータベースへの保存に失敗するときの観点は ImageFailureTests
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class ImageApiTests {

	static final int FIVE_MB = 5 * 1024 * 1024;

	@Autowired
	MockMvcTester mvc;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	MinIOContainer minio;

	private S3Client s3;

	private Cookie taro;

	private Cookie hanako;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, follows, storage_deletions RESTART IDENTITY CASCADE");
		this.clock.reset();
		this.s3 = TestcontainersConfiguration.s3Client(this.minio);
		emptyBucket(this.s3);
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		this.hanako = PostTestSupport.signup(this.mvc, "hanako", "はなこ");
	}

	@AfterEach
	void tearDown() {
		this.s3.close();
	}

	// ---- 画像つきの投稿（I-5・I-6）----

	@Test
	void 画像4枚を選んだ順に保存しContentTypeつきでS3に置き署名付きURLで読める() throws Exception {
		List<MockMultipartFile> files = List.of(image("a.jpg", jpeg(100)), image("b.png", png(200)),
				image("c.gif", gif(300)), image("d.webp", webp(400)));
		MvcTestResult result = create(this.taro, "4 枚の写真", files);

		assertThat(result).hasStatus(HttpStatus.CREATED);
		List<Map<String, Object>> images = JsonPath.read(content(result), "$.images");
		assertThat(images).hasSize(4);
		assertThat(this.jdbc.queryForList("SELECT content_type FROM post_images ORDER BY sort_order", String.class))
			.containsExactly("image/jpeg", "image/png", "image/gif", "image/webp");
		List<String> keys = this.jdbc.queryForList("SELECT storage_key FROM post_images ORDER BY sort_order",
				String.class);
		assertThat(keys).allMatch((key) -> key.matches("posts/[0-9a-f-]{36}\\.(jpg|png|gif|webp)"));
		assertThat(keys.get(0)).endsWith(".jpg");
		assertThat(keys.get(3)).endsWith(".webp");
		// 元のファイル名は使わない（5 章 No.1）
		// ファイル名の部分が UUID であることで確かめる。「b.png」などが含まれるかで確かめると、
		// UUID の末尾がたまたま「b」で拡張子が png のときに落ちる
		assertThat(keys).allMatch(
				(key) -> key.matches("posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z]+"));

		HeadObjectResponse head = this.s3
			.headObject((request) -> request.bucket(TestcontainersConfiguration.BUCKET).key(keys.get(1)));
		assertThat(head.contentType()).isEqualTo("image/png");

		// 署名付き URL は 15 分で切れ（期限は AWS SDK が実際の時刻で決める）、その URL で中身を読める
		Map<String, Object> second = images.get(1);
		assertThat(Instant.parse((String) second.get("expiresAt")))
			.isBetween(Instant.now().plus(Duration.ofMinutes(14)), Instant.now().plus(Duration.ofMinutes(15)));
		HttpResponse<byte[]> got = httpGet((String) second.get("url"));
		assertThat(got.statusCode()).isEqualTo(200);
		assertThat(got.headers().firstValue("Content-Type")).hasValue("image/png");
		assertThat(got.body()).isEqualTo(png(200));
	}

	@Test
	void 画像だけの投稿ができる() {
		MvcTestResult result = create(this.taro, "", List.of(image("a.png", png(10))));
		assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.body").isEqualTo("");
	}

	@Test
	void バケットのURLを署名なしで開いても画像は見られない() throws Exception {
		create(this.taro, "本文", List.of(image("a.png", png(10))));
		String key = this.jdbc.queryForObject("SELECT storage_key FROM post_images", String.class);

		HttpResponse<byte[]> got = httpGet(
				this.minio.getS3URL() + "/" + TestcontainersConfiguration.BUCKET + "/" + key);
		assertThat(got.statusCode()).isEqualTo(403);
	}

	// ---- 入力の確認（4 章）----

	@Test
	void 画像5枚は400のTOO_MANY_IMAGESで投稿も画像もできない() {
		List<MockMultipartFile> files = List.of(image("1.png", png(1)), image("2.png", png(1)), image("3.png", png(1)),
				image("4.png", png(1)), image("5.png", png(1)));
		assertError(create(this.taro, "5 枚", files), HttpStatus.BAD_REQUEST, "TOO_MANY_IMAGES");
		assertNothingSaved();
	}

	@Test
	void 画像5MBちょうどは添えられ5MBより1バイト大きいと413のIMAGE_TOO_LARGE() {
		assertThat(create(this.taro, "", List.of(image("big.jpg", jpeg(FIVE_MB - 3))))).hasStatus(HttpStatus.CREATED);
		assertThat(this.jdbc.queryForObject("SELECT byte_size FROM post_images", Integer.class)).isEqualTo(FIVE_MB);

		this.jdbc.execute("TRUNCATE posts CASCADE");
		emptyBucket(this.s3);
		assertError(create(this.taro, "", List.of(image("big.jpg", jpeg(FIVE_MB - 2)))), HttpStatus.CONTENT_TOO_LARGE,
				"IMAGE_TOO_LARGE");
		assertNothingSaved();
	}

	@Test
	void 拡張子をjpgに変えたテキストやPDFは400のIMAGE_TYPE_INVALID() {
		byte[] text = "これはテキストです".getBytes(StandardCharsets.UTF_8);
		byte[] pdf = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
		assertError(create(this.taro, "本文", List.of(image("text.jpg", text))), HttpStatus.BAD_REQUEST,
				"IMAGE_TYPE_INVALID");
		assertError(create(this.taro, "本文", List.of(image("doc.jpg", pdf))), HttpStatus.BAD_REQUEST,
				"IMAGE_TYPE_INVALID");
		// RIFF でも WEBP でなければ（WAV など）添えられない
		byte[] wav = "RIFF\0\0\0\0WAVEfmt ".getBytes(StandardCharsets.US_ASCII);
		assertError(create(this.taro, "本文", List.of(image("sound.webp", wav))), HttpStatus.BAD_REQUEST,
				"IMAGE_TYPE_INVALID");
		// 1 枚でもだめなら全部添えない
		assertError(create(this.taro, "本文", List.of(image("a.png", png(10)), image("text.jpg", text))),
				HttpStatus.BAD_REQUEST, "IMAGE_TYPE_INVALID");
		assertNothingSaved();
	}

	// ---- 編集・削除（FN-03 と一緒の観点）----

	@Test
	void 画像のある投稿は本文を0文字に編集できる() {
		long id = id(create(this.taro, "本文", List.of(image("a.png", png(10)))));
		MvcTestResult edited = this.mvc.patch()
			.uri("/api/posts/{id}", id)
			.with(csrf())
			.cookie(this.taro)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"\"}")
			.exchange();
		assertThat(edited).hasStatus(HttpStatus.OK).bodyJson().extractingPath("$.images.length()").isEqualTo(1);
	}

	@Test
	void 投稿を削除すると画像の行とS3のファイルも消える() {
		long id = id(create(this.taro, "本文", List.of(image("a.png", png(10)), image("b.png", png(20)))));
		long other = id(create(this.taro, "残す", List.of(image("c.png", png(30)))));
		assertThat(objects()).hasSize(3);

		// 他人は消せず、ファイルも残る
		assertThat(delete(this.hanako, id)).hasStatus(HttpStatus.FORBIDDEN);
		assertThat(objects()).hasSize(3);

		assertThat(delete(this.taro, id)).hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.jdbc.queryForList("SELECT post_id FROM post_images", Long.class)).containsExactly(other);
		assertThat(objects()).hasSize(1);
	}

	// ---- 表示（I-6）と URL の取り直し（I-8）----

	@Test
	void タイムラインと詳細の投稿に画像が選んだ順で出る() {
		long id = id(create(this.taro, "本文", List.of(image("a.gif", gif(1)), image("b.png", png(1)))));
		create(this.hanako, "画像なし", List.of());

		MvcTestResult timeline = this.mvc.get().uri("/api/timeline?tab=all").cookie(this.hanako).exchange();
		List<Integer> first = JsonPath.read(content(timeline), "$.items[1].images[*].id");
		assertThat(first).hasSize(2);
		assertThat(first.get(0)).isLessThan(first.get(1));
		assertThat(timeline).bodyJson().extractingPath("$.items[0].images").asArray().isEmpty();

		MvcTestResult detail = this.mvc.get().uri("/api/posts/{id}", id).cookie(this.hanako).exchange();
		assertThat(detail).bodyJson().extractingPath("$.images[*].id").isEqualTo(first);
	}

	@Test
	void URLを取り直せて削除された画像のIDは結果に入らない() throws Exception {
		long id = id(create(this.taro, "本文", List.of(image("a.png", png(10)))));
		long deletedPost = id(create(this.taro, "消す", List.of(image("b.png", png(10)))));
		long imageId = this.jdbc.queryForObject("SELECT id FROM post_images WHERE post_id = ?", Long.class, id);
		long deletedImageId = this.jdbc.queryForObject("SELECT id FROM post_images WHERE post_id = ?", Long.class,
				deletedPost);
		delete(this.taro, deletedPost);

		MvcTestResult result = urls(this.hanako, "{\"imageIds\":[" + imageId + "," + deletedImageId + "]}");
		assertThat(result).hasStatus(HttpStatus.OK);
		List<Map<String, Object>> items = JsonPath.read(content(result), "$.items");
		assertThat(items).hasSize(1);
		assertThat(items.getFirst().get("id")).isEqualTo((int) imageId);
		assertThat(httpGet((String) items.getFirst().get("url")).statusCode()).isEqualTo(200);
	}

	@Test
	void URLの取り直しは50個までで51個は400() {
		String fifty = Arrays.toString(new long[50]);
		String fiftyOne = Arrays.toString(new long[51]);
		assertThat(urls(this.taro, "{\"imageIds\":" + fifty + "}")).hasStatus(HttpStatus.OK);
		assertError(urls(this.taro, "{\"imageIds\":" + fiftyOne + "}"), HttpStatus.BAD_REQUEST, "BAD_REQUEST");
		assertError(urls(this.taro, "{}"), HttpStatus.BAD_REQUEST, "BAD_REQUEST");
	}

	@Test
	void URLの取り直しはログインしていないと401() {
		assertThat(this.mvc.post()
			.uri("/api/images/urls")
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"imageIds\":[1]}")
			.exchange()).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	// ---- ヘルパー ----

	private MvcTestResult create(Cookie user, String body, List<MockMultipartFile> files) {
		var request = this.mvc.post().uri("/api/posts").with(csrf()).cookie(user).multipart().param("body", body);
		for (MockMultipartFile file : files) {
			request = request.file(file);
		}
		return request.exchange();
	}

	private MvcTestResult delete(Cookie user, long id) {
		return this.mvc.delete().uri("/api/posts/{id}", id).with(csrf()).cookie(user).exchange();
	}

	private MvcTestResult urls(Cookie user, String json) {
		return this.mvc.post()
			.uri("/api/images/urls")
			.with(csrf())
			.cookie(user)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private void assertNothingSaved() {
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM posts", Long.class)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM post_images", Long.class)).isZero();
		assertThat(objects()).isEmpty();
	}

	private List<S3Object> objects() {
		return objects(this.s3);
	}

	static List<S3Object> objects(S3Client s3) {
		return s3.listObjectsV2((request) -> request.bucket(TestcontainersConfiguration.BUCKET)).contents();
	}

	static void emptyBucket(S3Client s3) {
		for (S3Object object : objects(s3)) {
			s3.deleteObject((request) -> request.bucket(TestcontainersConfiguration.BUCKET).key(object.key()));
		}
	}

	// 送るファイル名・Content-Type はわざとでたらめにする（API はファイルの中身で形式を決める）
	static MockMultipartFile image(String filename, byte[] data) {
		return new MockMultipartFile("images", filename, "application/octet-stream", data);
	}

	// 先頭のバイトだけを合わせた画像（FN-04 4 章）。残りは extra バイトの 0
	static byte[] jpeg(int extra) {
		return withHead(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF }, extra);
	}

	static byte[] png(int extra) {
		return withHead(new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A }, extra);
	}

	static byte[] gif(int extra) {
		return withHead("GIF89a".getBytes(StandardCharsets.US_ASCII), extra);
	}

	static byte[] webp(int extra) {
		return withHead("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.US_ASCII), extra);
	}

	private static byte[] withHead(byte[] head, int extra) {
		return Arrays.copyOf(head, head.length + extra);
	}

	private static HttpResponse<byte[]> httpGet(String url) throws IOException, InterruptedException {
		try (HttpClient client = HttpClient.newHttpClient()) {
			return client.send(HttpRequest.newBuilder(URI.create(url)).build(),
					HttpResponse.BodyHandlers.ofByteArray());
		}
	}

	static long id(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.CREATED);
		return JsonPath.<Number>read(content(result), "$.id").longValue();
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
