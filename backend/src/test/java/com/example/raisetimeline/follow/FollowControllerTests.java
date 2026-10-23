package com.example.raisetimeline.follow;

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
import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.user.UserSummary;

// フォローの API（FN-07 6 章）の入口
@ControllerTest(FollowController.class)
class FollowControllerTests {

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	FollowService followService;

	@Test
	void フォローはPUTで解除はDELETE() {
		when(this.followService.follow(1, "Hanako")).thenReturn(new FollowResult(true, 7));
		when(this.followService.unfollow(1, "Hanako")).thenReturn(new FollowResult(false, 6));

		assertThat(this.mvc.put().uri("/api/users/Hanako/follow").with(csrf()).with(loggedIn(1)).exchange())
			.hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("{\"following\":true,\"followerCount\":7}");
		assertThat(this.mvc.delete().uri("/api/users/Hanako/follow").with(csrf()).with(loggedIn(1)).exchange())
			.hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("{\"following\":false,\"followerCount\":6}");
	}

	@Test
	void フォロー中とフォロワーの一覧() {
		UserSummary jiro = new UserSummary("jiro", "じろう", "", null, false, false);
		when(this.followService.following(1, "hanako", null)).thenReturn(new FollowsResponse(List.of(jiro), "9_3"));
		when(this.followService.followers(1, "hanako", "9_3")).thenReturn(new FollowsResponse(List.of(), null));

		assertThat(this.mvc.get().uri("/api/users/hanako/following").with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.extractingPath("$.nextCursor")
			.isEqualTo("9_3");
		assertThat(this.mvc.get().uri("/api/users/hanako/followers?cursor=9_3").with(loggedIn(1)).exchange())
			.hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("{\"items\":[],\"nextCursor\":null}");
	}

	@Test
	void 自分をフォローしようとすると400のCANNOT_FOLLOW_SELF() {
		when(this.followService.follow(1, "taro_y")).thenThrow(new ApiException(ErrorCode.CANNOT_FOLLOW_SELF));
		assertError(this.mvc.put().uri("/api/users/taro_y/follow").with(csrf()).with(loggedIn(1)).exchange(),
				ErrorCode.CANNOT_FOLLOW_SELF);
	}

	@Test
	void ログインが要る() {
		assertError(this.mvc.get().uri("/api/users/hanako/followers").exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.followService);
	}

}
