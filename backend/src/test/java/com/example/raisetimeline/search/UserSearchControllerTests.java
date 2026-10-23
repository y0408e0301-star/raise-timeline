package com.example.raisetimeline.search;

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
import com.example.raisetimeline.user.UserSummary;

// ユーザー検索の API（FN-08 6 章）の入口
@ControllerTest(UserSearchController.class)
class UserSearchControllerTests {

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	UserSearchService searchService;

	@Test
	void 検索語とoffsetを文字のまま渡す() {
		when(this.searchService.search(1, "@taro", "20"))
			.thenReturn(new UserSearchResponse(List.of(new UserSummary("taro_y", "たろう", "", null, false, true)), 40));

		assertThat(this.mvc.get().uri("/api/search/users?q={q}&offset=20", "@taro").with(loggedIn(1)).exchange())
			.hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					{
					  "items": [ {
					    "username": "taro_y", "displayName": "たろう", "bioFirstLine": "",
					    "iconUrl": null, "followedByMe": false, "me": true
					  } ],
					  "nextOffset": 40
					}
					""");
	}

	@Test
	void 検索語の誤りは400のQUERY_INVALID() {
		when(this.searchService.search(1, null, null)).thenThrow(new ApiException(ErrorCode.QUERY_INVALID, "q"));
		assertError(this.mvc.get().uri("/api/search/users").with(loggedIn(1)).exchange(), ErrorCode.QUERY_INVALID, "q");
	}

	@Test
	void ログインが要る() {
		assertError(this.mvc.get().uri("/api/search/users?q=taro").exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.searchService);
	}

}
