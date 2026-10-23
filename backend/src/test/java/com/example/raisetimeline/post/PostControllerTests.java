package com.example.raisetimeline.post;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;

// 投稿の API（FN-03・FN-04 6 章）の入口と、API のエラーの形（ApiExceptionHandler、機能定義書 3.3）
@ControllerTest(PostController.class)
class PostControllerTests {

	static final PostView VIEW = new PostView(10, new PostView.Author("taro_y", "たろう", null), "今日は晴れ",
			List.of(new PostView.Image(100, "https://s3/posts/a.png", Instant.parse("2026-10-24T03:15:00Z"))), 2, 3,
			true, true, Instant.parse("2026-10-24T03:00:00Z"), null);

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	PostService postService;

	@Test
	void 投稿はmultipartで本文と画像を受け取り201で返す() {
		when(this.postService.create(eq(1L), eq("今日は晴れ"), any())).thenReturn(VIEW);

		MvcTestResult result = this.mvc.post()
			.uri("/api/posts")
			.with(csrf())
			.with(loggedIn(1))
			.multipart()
			.param("body", "今日は晴れ")
			.file(new MockMultipartFile("images", "a.png", "image/png", new byte[] { 1 }))
			.file(new MockMultipartFile("images", "b.png", "image/png", new byte[] { 2 }))
			.exchange();

		assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().isStrictlyEqualTo("""
				{
				  "id": 10,
				  "author": { "username": "taro_y", "displayName": "たろう", "iconUrl": null },
				  "body": "今日は晴れ",
				  "images": [ { "id": 100, "url": "https://s3/posts/a.png", "expiresAt": "2026-10-24T03:15:00Z" } ],
				  "likeCount": 2,
				  "commentCount": 3,
				  "likedByMe": true,
				  "mine": true,
				  "createdAt": "2026-10-24T03:00:00Z",
				  "editedAt": null
				}
				""");
		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<MultipartFile>> files = ArgumentCaptor.forClass(List.class);
		verify(this.postService).create(eq(1L), eq("今日は晴れ"), files.capture());
		assertThat(files.getValue()).extracting(MultipartFile::getOriginalFilename).containsExactly("a.png", "b.png");
	}

	@Test
	void 画像がなければ空のリストを渡す() {
		when(this.postService.create(1, "本文", List.of())).thenReturn(VIEW);
		MvcTestResult result = this.mvc.post()
			.uri("/api/posts")
			.with(csrf())
			.with(loggedIn(1))
			.multipart()
			.param("body", "本文")
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
	}

	@Test
	void 詳細() {
		when(this.postService.get(2, 10)).thenReturn(VIEW);
		assertThat(this.mvc.get().uri("/api/posts/10").with(loggedIn(2)).exchange()).hasStatusOk()
			.bodyJson()
			.extractingPath("$.id")
			.isEqualTo(10);
	}

	@Test
	void 編集はJSONの本文を渡す() {
		when(this.postService.edit(1, 10, "新しい本文")).thenReturn(VIEW);
		MvcTestResult result = this.mvc.patch()
			.uri("/api/posts/10")
			.with(csrf())
			.with(loggedIn(1))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"新しい本文\"}")
			.exchange();
		assertThat(result).hasStatusOk();
	}

	@Test
	void 削除は204() {
		assertThat(this.mvc.delete().uri("/api/posts/10").with(csrf()).with(loggedIn(1)).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		verify(this.postService).delete(1, 10);
	}

	@Test
	void ログインしていなければ401でサービスは呼ばない() {
		assertError(this.mvc.get().uri("/api/posts/10").exchange(), ErrorCode.UNAUTHENTICATED);
		assertError(this.mvc.delete().uri("/api/posts/10").with(csrf()).exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.postService);
	}

	@Test
	void サービスのエラーはそのステータスとcodeで返す() {
		when(this.postService.get(1, 10)).thenThrow(new ApiException(ErrorCode.POST_NOT_FOUND));
		when(this.postService.edit(1, 10, "x")).thenThrow(new ApiException(ErrorCode.FORBIDDEN));
		assertError(this.mvc.get().uri("/api/posts/10").with(loggedIn(1)).exchange(), ErrorCode.POST_NOT_FOUND);
		assertError(this.mvc.patch()
			.uri("/api/posts/10")
			.with(csrf())
			.with(loggedIn(1))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"x\"}")
			.exchange(), ErrorCode.FORBIDDEN);
	}

	// ---- API のエラーの形（ApiExceptionHandler）----

	@Test
	void 思いがけない失敗は500で中身を見せない() {
		when(this.postService.get(1, 10)).thenThrow(new IllegalStateException("データベースのパスワードは secret"));
		MvcTestResult result = this.mvc.get().uri("/api/posts/10").with(loggedIn(1)).exchange();
		assertError(result, ErrorCode.INTERNAL_ERROR);
		assertThat(result).bodyText().doesNotContain("secret");
	}

	@Test
	void 画像が大きすぎてmultipartで断られたら413のIMAGE_TOO_LARGE() {
		when(this.postService.create(anyLong(), any(), any())).thenThrow(new MaxUploadSizeExceededException(21));
		MvcTestResult result = this.mvc.post()
			.uri("/api/posts")
			.with(csrf())
			.with(loggedIn(1))
			.multipart()
			.param("body", "本文")
			.exchange();
		assertError(result, ErrorCode.IMAGE_TOO_LARGE, "images");
	}

	@Test
	void IDが数字でなければ400のBAD_REQUEST() {
		assertError(this.mvc.get().uri("/api/posts/abc").with(loggedIn(1)).exchange(), ErrorCode.BAD_REQUEST);
	}

	@Test
	void ないAPIは404のNOT_FOUND() {
		assertError(this.mvc.get().uri("/api/unknown").with(loggedIn(1)).exchange(), ErrorCode.NOT_FOUND);
	}

	@Test
	void メソッドや形式が違えばHTTPステータスの名前をcodeにする() {
		MvcTestResult put = this.mvc.put().uri("/api/posts/10").with(csrf()).with(loggedIn(1)).exchange();
		assertThat(put).hasStatus(HttpStatus.METHOD_NOT_ALLOWED)
			.bodyJson()
			.extractingPath("$.code")
			.isEqualTo("METHOD_NOT_ALLOWED");

		MvcTestResult json = this.mvc.post()
			.uri("/api/posts")
			.with(csrf())
			.with(loggedIn(1))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"本文\"}")
			.exchange();
		assertThat(json).hasStatus(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
			.bodyJson()
			.extractingPath("$.code")
			.isEqualTo("UNSUPPORTED_MEDIA_TYPE");
		verifyNoInteractions(this.postService);
	}

}
