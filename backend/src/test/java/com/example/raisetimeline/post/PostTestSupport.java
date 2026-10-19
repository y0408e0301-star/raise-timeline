package com.example.raisetimeline.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import jakarta.servlet.http.Cookie;

// 投稿まわりのテストで使う準備
final class PostTestSupport {

	private PostTestSupport() {
	}

	// ユーザーを登録し、ログインした状態の Cookie（access_token）を返す
	static Cookie signup(MockMvcTester mvc, String username, String displayName) {
		MvcTestResult result = mvc.post()
			.uri("/api/auth/signup")
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"" + username + "\",\"displayName\":\"" + displayName
					+ "\",\"password\":\"password1\"}")
			.exchange();
		assertThat(result).hasStatus(HttpStatus.CREATED);
		Cookie access = result.getResponse().getCookie("access_token");
		assertThat(access).isNotNull();
		return access;
	}

}
