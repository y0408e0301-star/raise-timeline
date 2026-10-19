package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.testcontainers.containers.MinIOContainer;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.StorageDeleter;

import jakarta.servlet.http.Cookie;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;

// S3 やデータベースへの保存・削除に失敗したときの動き（データ設計書 BR-4・BR-5、機能定義書 FN-04 3.1・10 章）。
// S3 の失敗は ImageStorage を差し替えて起こす（Spring のコンテキストが変わるので、ImageApiTests とは分ける）
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class ImageFailureTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	MinIOContainer minio;

	@Autowired
	StorageDeleter deleter;

	@MockitoSpyBean
	ImageStorage storage;

	private S3Client s3;

	private Cookie taro;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, follows, storage_deletions RESTART IDENTITY CASCADE");
		this.s3 = TestcontainersConfiguration.s3Client(this.minio);
		ImageApiTests.emptyBucket(this.s3);
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
	}

	@AfterEach
	void tearDown() {
		this.jdbc.execute("DROP TRIGGER IF EXISTS fail_post_images ON post_images");
		this.jdbc.execute("DROP FUNCTION IF EXISTS fail_post_images()");
		this.s3.close();
	}

	@Test
	void S3への保存が途中で失敗したら500のIMAGE_UPLOAD_FAILEDで投稿も画像も残らない() {
		// 1 枚目は置けて、2 枚目で S3 が止まった
		doCallRealMethod().doThrow(SdkClientException.create("S3 が止まっている"))
			.when(this.storage)
			.put(anyString(), any(ImageFormat.class), any(byte[].class));

		MvcTestResult result = create(List.of(ImageApiTests.image("a.png", ImageApiTests.png(10)),
				ImageApiTests.image("b.png", ImageApiTests.png(10))));
		assertThat(result).hasStatus(HttpStatus.INTERNAL_SERVER_ERROR)
			.bodyJson()
			.extractingPath("$.code")
			.isEqualTo("IMAGE_UPLOAD_FAILED");
		assertNothingSaved();
	}

	@Test
	void データベースへの保存に失敗したらS3に置いた画像を消す() {
		this.jdbc.execute("""
				CREATE FUNCTION fail_post_images() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'データベースの障害'; END $$""");
		this.jdbc.execute(
				"CREATE TRIGGER fail_post_images BEFORE INSERT ON post_images FOR EACH ROW EXECUTE FUNCTION fail_post_images()");

		MvcTestResult result = create(List.of(ImageApiTests.image("a.png", ImageApiTests.png(10))));
		assertThat(result).hasStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		assertNothingSaved();
	}

	@Test
	void S3から消せなかった画像は記録しあとで消し直す() {
		long id = ImageApiTests.id(create(List.of(ImageApiTests.image("a.png", ImageApiTests.png(10)))));
		String key = this.jdbc.queryForObject("SELECT storage_key FROM post_images", String.class);
		doThrow(SdkClientException.create("S3 が止まっている")).when(this.storage).delete(anyString());

		// 投稿の削除は成功し、消せなかったファイルを記録する
		assertThat(this.mvc.delete().uri("/api/posts/{id}", id).with(csrf()).cookie(this.taro).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM posts", Long.class)).isZero();
		assertThat(this.jdbc.queryForList("SELECT storage_key FROM storage_deletions", String.class))
			.containsExactly(key);
		assertThat(ImageApiTests.objects(this.s3)).hasSize(1);

		// まだ S3 が止まっていれば記録を残す
		this.deleter.retry();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM storage_deletions", Long.class)).isOne();

		// S3 が戻ったら消して、記録も消す
		doCallRealMethod().when(this.storage).delete(anyString());
		this.deleter.retry();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM storage_deletions", Long.class)).isZero();
		assertThat(ImageApiTests.objects(this.s3)).isEmpty();
	}

	private MvcTestResult create(List<MockMultipartFile> files) {
		var request = this.mvc.post().uri("/api/posts").with(csrf()).cookie(this.taro).multipart().param("body", "本文");
		for (MockMultipartFile file : files) {
			request = request.file(file);
		}
		return request.exchange();
	}

	private void assertNothingSaved() {
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM posts", Long.class)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM post_images", Long.class)).isZero();
		assertThat(ImageApiTests.objects(this.s3)).isEmpty();
	}

}
