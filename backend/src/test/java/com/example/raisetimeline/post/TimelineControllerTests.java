package com.example.raisetimeline.post;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;

// タイムライン（FN-02 6 章）とプロフィールの投稿の一覧（FN-09 6 章）の入口
@ControllerTest(TimelineController.class)
class TimelineControllerTests {

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	TimelineService timelineService;

	@Test
	void タブとcursorをそのまま渡す() {
		when(this.timelineService.read(1, "all", "81"))
			.thenReturn(new TimelineResponse(List.of(PostControllerTests.VIEW), "61", null));

		assertThat(this.mvc.get().uri("/api/timeline?tab=all&cursor=81").with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.extractingPath("$.nextCursor")
			.isEqualTo("61");
	}

	@Test
	void フォロー数はあるときだけJSONに入れる() {
		when(this.timelineService.read(1, "following", null)).thenReturn(new TimelineResponse(List.of(), null, 0L));
		when(this.timelineService.read(1, "all", null)).thenReturn(new TimelineResponse(List.of(), null, null));

		assertThat(this.mvc.get().uri("/api/timeline?tab=following").with(loggedIn(1)).exchange()).bodyJson()
			.isStrictlyEqualTo("{\"items\":[],\"nextCursor\":null,\"followingCount\":0}");
		assertThat(this.mvc.get().uri("/api/timeline?tab=all").with(loggedIn(1)).exchange()).bodyJson()
			.isStrictlyEqualTo("{\"items\":[],\"nextCursor\":null}");
	}

	@Test
	void タブがなくてもサービスに任せてTAB_INVALIDにする() {
		when(this.timelineService.read(1, null, null)).thenThrow(new ApiException(ErrorCode.TAB_INVALID, "tab"));
		assertError(this.mvc.get().uri("/api/timeline").with(loggedIn(1)).exchange(), ErrorCode.TAB_INVALID, "tab");
	}

	@Test
	void プロフィールの投稿はURLのユーザーIDを渡す() {
		when(this.timelineService.byUser(1, "Hanako", null)).thenReturn(new TimelineResponse(List.of(), null, null));
		assertThat(this.mvc.get().uri("/api/users/Hanako/posts").with(loggedIn(1)).exchange()).hasStatusOk();
	}

	@Test
	void ログインが要る() {
		assertError(this.mvc.get().uri("/api/timeline?tab=all").exchange(), ErrorCode.UNAUTHENTICATED);
		assertError(this.mvc.get().uri("/api/users/hanako/posts").exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.timelineService);
	}

}
