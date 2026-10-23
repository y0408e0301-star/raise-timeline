package com.example.raisetimeline.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 画面の URL なら index.html を返し、API・ないファイルは 404 のままにする（インフラ設計書 5.2）
class AppRouteResolverTests {

	@ParameterizedTest
	@ValueSource(strings = { "", "login", "users/taro_y", "users/taro_y/following", "posts/12", "search",
			"settings/profile", "apiary", "users/api" })
	void 画面のURL(String path) {
		assertThat(FrontendConfig.AppRouteResolver.isAppRoute(path)).isTrue();
	}

	@ParameterizedTest
	@ValueSource(strings = { "api", "api/posts", "api/unknown", "actuator", "actuator/health", "favicon.ico",
			"assets/index-1234.js", "users/taro.y", "robots.txt" })
	void 画面のURLではない(String path) {
		assertThat(FrontendConfig.AppRouteResolver.isAppRoute(path)).isFalse();
	}

}
