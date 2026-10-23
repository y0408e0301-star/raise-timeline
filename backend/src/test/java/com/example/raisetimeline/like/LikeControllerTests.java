package com.example.raisetimeline.like;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.user.UserSummary;

// いいねの API（FN-06 6 章）の入口
@ControllerTest(LikeController.class)
class LikeControllerTests {

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	LikeService likeService;

	@Test
	void いいねはPUTで取り消しはDELETE() {
		when(this.likeService.like(1, 10)).thenReturn(new LikeResult(true, 3));
		when(this.likeService.unlike(1, 10)).thenReturn(new LikeResult(false, 2));

		assertThat(this.mvc.put().uri("/api/posts/10/like").with(csrf()).with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("{\"liked\":true,\"likeCount\":3}");
		assertThat(this.mvc.delete().uri("/api/posts/10/like").with(csrf()).with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("{\"liked\":false,\"likeCount\":2}");
	}

	@Test
	void いいねした人の一覧はユーザーの行の形で返す() {
		when(this.likeService.likers(1, 10, "5_2")).thenReturn(
				new LikersResponse(List.of(new UserSummary("hanako", "はなこ", "よろしく", null, true, false)), null, 1));

		assertThat(this.mvc.get().uri("/api/posts/10/likes?cursor=5_2").with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					{
					  "items": [ {
					    "username": "hanako", "displayName": "はなこ", "bioFirstLine": "よろしく",
					    "iconUrl": null, "followedByMe": true, "me": false
					  } ],
					  "nextCursor": null,
					  "totalCount": 1
					}
					""");
	}

	@Test
	void ログインとCSRFトークンが要る() {
		assertError(this.mvc.put().uri("/api/posts/10/like").with(csrf()).exchange(), ErrorCode.UNAUTHENTICATED);
		assertError(this.mvc.put().uri("/api/posts/10/like").with(loggedIn(1)).exchange(), ErrorCode.FORBIDDEN);
		verifyNoInteractions(this.likeService);
	}

}
