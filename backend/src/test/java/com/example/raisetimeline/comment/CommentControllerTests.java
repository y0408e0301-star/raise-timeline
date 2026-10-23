package com.example.raisetimeline.comment;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.post.PostView;

// コメントの API（FN-05 6 章）の入口
@ControllerTest(CommentController.class)
class CommentControllerTests {

	private static final CommentView VIEW = new CommentView(5, new PostView.Author("hanako", "はなこ", null), "よい写真", true,
			Instant.parse("2026-10-24T03:00:00Z"));

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	CommentService commentService;

	@Test
	void 一覧はcursorを渡し決めた形で返す() {
		when(this.commentService.list(2, 10, "4")).thenReturn(new CommentsResponse(List.of(VIEW), null));

		assertThat(this.mvc.get().uri("/api/posts/10/comments?cursor=4").with(loggedIn(2)).exchange()).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					{
					  "items": [ {
					    "id": 5,
					    "author": { "username": "hanako", "displayName": "はなこ", "iconUrl": null },
					    "body": "よい写真",
					    "mine": true,
					    "createdAt": "2026-10-24T03:00:00Z"
					  } ],
					  "nextCursor": null
					}
					""");
	}

	@Test
	void 追加は201() {
		when(this.commentService.create(2, 10, "よい写真")).thenReturn(VIEW);
		MvcTestResult result = this.mvc.post()
			.uri("/api/posts/10/comments")
			.with(csrf())
			.with(loggedIn(2))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"よい写真\"}")
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.id").isEqualTo(5);
	}

	@Test
	void 削除は204でほかの人のコメントは403() {
		assertThat(this.mvc.delete().uri("/api/comments/5").with(csrf()).with(loggedIn(2)).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		verify(this.commentService).delete(2, 5);

		doThrow(new ApiException(ErrorCode.FORBIDDEN)).when(this.commentService).delete(3, 5);
		assertError(this.mvc.delete().uri("/api/comments/5").with(csrf()).with(loggedIn(3)).exchange(),
				ErrorCode.FORBIDDEN);
	}

	@Test
	void ログインが要る() {
		assertError(this.mvc.get().uri("/api/posts/10/comments").exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.commentService);
	}

}
