package com.example.raisetimeline.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

// S3 に画像を置く・消す・署名付き URL を作る（FN-04 5 章）。S3 とは通信せずに確かめる
@ExtendWith(MockitoExtension.class)
class ImageStorageTests {

	@Mock
	S3Client s3;

	// 署名付き URL は手元で計算するだけなので、本物の部品を使う
	private S3Presigner presigner;

	private ImageStorage storage;

	@BeforeEach
	void setUp() {
		this.presigner = S3Presigner.builder()
			.region(Region.AP_NORTHEAST_1)
			.endpointOverride(URI.create("http://localhost:9000"))
			.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
			.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("key", "secret")))
			.build();
		this.storage = new ImageStorage(this.s3, this.presigner,
				new StorageProperties("rt-images-test", "ap-northeast-1", null, null, null));
	}

	@AfterEach
	void tearDown() {
		this.presigner.close();
	}

	@Test
	void キーはフォルダとUUIDと拡張子で元のファイル名を使わない() {
		assertThat(ImageStorage.newKey("posts", ImageFormat.PNG))
			.matches("posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png");
		assertThat(ImageStorage.newKey("icons", ImageFormat.JPEG)).startsWith("icons/").endsWith(".jpg");
	}

	@Test
	void 毎回違うキーを作る() {
		assertThat(ImageStorage.newKey("posts", ImageFormat.PNG))
			.isNotEqualTo(ImageStorage.newKey("posts", ImageFormat.PNG));
	}

	@Test
	void ContentTypeを付けてバケットに置く() {
		this.storage.put("posts/a.webp", ImageFormat.WEBP, new byte[] { 1, 2, 3 });
		ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
		verify(this.s3).putObject(request.capture(), any(RequestBody.class));
		assertThat(request.getValue().bucket()).isEqualTo("rt-images-test");
		assertThat(request.getValue().key()).isEqualTo("posts/a.webp");
		assertThat(request.getValue().contentType()).isEqualTo("image/webp");
	}

	@Test
	void バケットのキーを消す() {
		this.storage.delete("posts/a.png");
		verify(this.s3).deleteObject(DeleteObjectRequest.builder().bucket("rt-images-test").key("posts/a.png").build());
	}

	@Test
	void 署名付きURLは15分で切れる() {
		ImageStorage.SignedUrl url = this.storage.signedUrl("posts/a.png");
		assertThat(url.url()).startsWith("http://localhost:9000/rt-images-test/posts/a.png?")
			.contains("X-Amz-Expires=900")
			.contains("X-Amz-Signature=");
		assertThat(url.expiresAt()).isCloseTo(Instant.now().plus(ImageStorage.URL_TTL), within(1, ChronoUnit.MINUTES));
	}

}
