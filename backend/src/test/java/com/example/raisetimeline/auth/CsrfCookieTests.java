package com.example.raisetimeline.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import com.example.raisetimeline.MutableClock;
import com.example.raisetimeline.TestcontainersConfiguration;

// 画面と同じ手順で CSRF トークンを受け取り、送り返せることを、実際に HTTP で確かめる。
// MockMvc では spring-security-test が CSRF トークンの保存先を差し替えるため、Cookie の発行を確かめられない。
// サーバーはテストの間だけ空いているポートで起動する（開発用の 8080 とはぶつからない）
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Import({ TestcontainersConfiguration.class, MutableClock.Config.class })
class CsrfCookieTests {

	@LocalServerPort
	int port;

	private final HttpClient client = HttpClient.newHttpClient();

	@Test
	void 最初のGETで受け取ったXSRF_TOKENをヘッダーで送り返すとPOSTできる() throws Exception {
		// 画面は起動したときに GET /api/auth/me を呼ぶ。ログインしていなくても XSRF-TOKEN の Cookie を受け取る
		HttpResponse<String> me = send(HttpRequest.newBuilder(uri("/api/auth/me")).GET());
		assertThat(me.statusCode()).isEqualTo(401);
		String setCookie = me.headers()
			.allValues("Set-Cookie")
			.stream()
			.filter((value) -> value.startsWith("XSRF-TOKEN="))
			.findFirst()
			.orElseThrow();
		// 画面の JavaScript が読んでヘッダーに入れるため、HttpOnly は付けない
		assertThat(setCookie).doesNotContainIgnoringCase("HttpOnly");
		String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));

		assertThat(signup("csrf_ok", token, token).statusCode()).isEqualTo(201);
		assertThat(signup("csrf_ng", token, "wrong").statusCode()).isEqualTo(403);
	}

	private HttpResponse<String> signup(String username, String cookieToken, String headerToken)
			throws IOException, InterruptedException {
		String body = "{\"username\":\"" + username + "\",\"displayName\":\"名前\",\"password\":\"password1\"}";
		return send(HttpRequest.newBuilder(uri("/api/auth/signup"))
			.headers("Content-Type", "application/json", "Cookie", "XSRF-TOKEN=" + cookieToken, "X-XSRF-TOKEN",
					headerToken)
			.POST(HttpRequest.BodyPublishers.ofString(body)));
	}

	private HttpResponse<String> send(HttpRequest.Builder request) throws IOException, InterruptedException {
		return this.client.send(request.build(), HttpResponse.BodyHandlers.ofString());
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + this.port + path);
	}

}
