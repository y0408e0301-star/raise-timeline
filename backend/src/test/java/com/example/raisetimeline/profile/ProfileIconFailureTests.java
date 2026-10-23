package com.example.raisetimeline.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

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
import com.example.raisetimeline.post.ImageApiTests;
import com.example.raisetimeline.post.PostTestSupport;
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;

import jakarta.servlet.http.Cookie;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.S3Object;

// アイコンの S3 やデータベースへの保存・削除に失敗したときの動き（機能定義書 FN-09 3.1・10 章、データ設計書 BR-10）。
// S3 の失敗は ImageStorage を差し替えて起こす（Spring のコンテキストが変わるので、ProfileEditApiTests とは分ける）
@SpringBootTest
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
@AutoConfigureMockMvc
class ProfileIconFailureTests {

	@Autowired
	MockMvcTester mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	MinIOContainer minio;

	@MockitoSpyBean
	ImageStorage storage;

	private S3Client s3;

	// users.id は 1
	private Cookie taro;

	// 失敗させる前に設定しておいたアイコン
	private String firstKey;

	@BeforeEach
	void setUp() {
		this.jdbc.execute("TRUNCATE users, refresh_tokens, posts, follows, storage_deletions RESTART IDENTITY CASCADE");
		this.s3 = TestcontainersConfiguration.s3Client(this.minio);
		ImageApiTests.emptyBucket(this.s3);
		this.taro = PostTestSupport.signup(this.mvc, "taro_y", "たろう");
		assertThat(changeIcon()).hasStatus(HttpStatus.OK);
		this.firstKey = iconKey();
	}

	@AfterEach
	void tearDown() {
		this.jdbc.execute("DROP TRIGGER IF EXISTS fail_users_update ON users");
		this.jdbc.execute("DROP FUNCTION IF EXISTS fail_users_update()");
		this.s3.close();
	}

	@Test
	void S3への保存に失敗したら500のICON_UPLOAD_FAILEDで前のアイコンのまま() {
		doThrow(SdkClientException.create("S3 が止まっている")).when(this.storage)
			.put(anyString(), any(ImageFormat.class), any(byte[].class));

		MvcTestResult result = changeIcon();
		assertThat(result).hasStatus(HttpStatus.INTERNAL_SERVER_ERROR)
			.bodyJson()
			.extractingPath("$.code")
			.isEqualTo("ICON_UPLOAD_FAILED");
		assertThat(iconKey()).isEqualTo(this.firstKey);
		assertThat(ImageApiTests.objects(this.s3)).extracting(S3Object::key).containsExactly(this.firstKey);
	}

	@Test
	void データベースの更新に失敗したら置いた画像を消し前のアイコンのまま() {
		this.jdbc.execute("""
				CREATE FUNCTION fail_users_update() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'データベースの障害'; END $$""");
		this.jdbc.execute(
				"CREATE TRIGGER fail_users_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_users_update()");

		assertThat(changeIcon()).hasStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		assertThat(iconKey()).isEqualTo(this.firstKey);
		assertThat(ImageApiTests.objects(this.s3)).extracting(S3Object::key).containsExactly(this.firstKey);
	}

	@Test
	void 前のアイコンをS3から消せなくても差し替えは成功し消せなかったファイルを記録する() {
		doThrow(SdkClientException.create("S3 が止まっている")).when(this.storage).delete(anyString());

		assertThat(changeIcon()).hasStatus(HttpStatus.OK);
		assertThat(iconKey()).isNotEqualTo(this.firstKey);
		assertThat(this.jdbc.queryForList("SELECT storage_key FROM storage_deletions", String.class))
			.containsExactly(this.firstKey);

		// 外すときも同じ
		String secondKey = iconKey();
		assertThat(this.mvc.delete().uri("/api/me/icon").with(csrf()).cookie(this.taro).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.jdbc.queryForList("SELECT storage_key FROM storage_deletions ORDER BY id", String.class))
			.containsExactly(this.firstKey, secondKey);
	}

	private MvcTestResult changeIcon() {
		return this.mvc.put()
			.uri("/api/me/icon")
			.with(csrf())
			.cookie(this.taro)
			.multipart()
			.file(new MockMultipartFile("icon", "icon.png", "image/png", ImageApiTests.png(10)))
			.exchange();
	}

	private String iconKey() {
		return this.jdbc.queryForObject("SELECT icon_key FROM users WHERE id = 1", String.class);
	}

}
