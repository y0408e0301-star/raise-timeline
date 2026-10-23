package com.example.raisetimeline.post;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ErrorCode;

// 画像の URL の取り直し（FN-04 6 章、I-8）
@ControllerTest(ImageController.class)
class ImageControllerTests {

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	PostViews views;

	@Test
	void 見つかった画像の新しいURLを返す() {
		when(this.views.images(List.of(100L, 999L))).thenReturn(
				List.of(new PostView.Image(100, "https://s3/posts/a.png", Instant.parse("2026-10-24T03:15:00Z"))));

		assertThat(urls("{\"imageIds\":[100,999]}")).hasStatusOk().bodyJson().isStrictlyEqualTo("""
				{ "items": [ { "id": 100, "url": "https://s3/posts/a.png", "expiresAt": "2026-10-24T03:15:00Z" } ] }
				""");
	}

	@Test
	void 五十個までなら聞ける() {
		List<Long> ids = IntStream.rangeClosed(1, 50).mapToObj((i) -> (long) i).toList();
		when(this.views.images(ids)).thenReturn(List.of());
		assertThat(urls("{\"imageIds\":" + ids + "}")).hasStatusOk();
	}

	@Test
	void 五十一個やIDの一覧がないときは400のBAD_REQUEST() {
		String ids = IntStream.rangeClosed(1, 51).mapToObj(String::valueOf).collect(Collectors.joining(","));
		assertError(urls("{\"imageIds\":[" + ids + "]}"), ErrorCode.BAD_REQUEST, "imageIds");
		assertError(urls("{}"), ErrorCode.BAD_REQUEST, "imageIds");
		verifyNoInteractions(this.views);
	}

	private MvcTestResult urls(String json) {
		return this.mvc.post()
			.uri("/api/images/urls")
			.with(csrf())
			.with(loggedIn(1))
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

}
