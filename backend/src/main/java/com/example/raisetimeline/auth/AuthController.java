package com.example.raisetimeline.auth;

import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorResponse;

// ユーザー登録・ログインの API（機能定義書 FN-01 6 章）
@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AuthService authService;

	private final AuthCookies cookies;

	AuthController(AuthService authService, AuthCookies cookies) {
		this.authService = authService;
		this.cookies = cookies;
	}

	// ユーザー ID の入力欄から離れたときに、使えるかどうかを確かめる
	@GetMapping("/username-availability")
	UsernameAvailability usernameAvailability(@RequestParam(required = false) @Nullable String username) {
		return new UsernameAvailability(this.authService.isUsernameAvailable(username));
	}

	@PostMapping("/signup")
	ResponseEntity<AuthService.Me> signup(@RequestBody SignupRequest request) {
		AuthService.LoginResult result = this.authService.signup(request.username(), request.displayName(),
				request.password());
		return withCookies(ResponseEntity.status(HttpStatus.CREATED), this.cookies.issue(result.tokens()))
			.body(result.me());
	}

	@PostMapping("/login")
	ResponseEntity<AuthService.Me> login(@RequestBody LoginRequest request) {
		AuthService.LoginResult result = this.authService.login(request.username(), request.password());
		return withCookies(ResponseEntity.ok(), this.cookies.issue(result.tokens())).body(result.me());
	}

	// 取り直しに失敗したときは、使えなくなった Cookie を消してから 401 を返す
	@PostMapping("/refresh")
	ResponseEntity<?> refresh(@CookieValue(name = AuthCookies.REFRESH_TOKEN, required = false) @Nullable String token) {
		AuthService.LoginResult result;
		try {
			result = this.authService.refresh(token);
		}
		catch (ApiException ex) {
			return withCookies(ResponseEntity.status(ex.code().status()), this.cookies.clear())
				.body(ErrorResponse.of(ex.code(), null));
		}
		return withCookies(ResponseEntity.ok(), this.cookies.issue(result.tokens())).body(result.me());
	}

	@PostMapping("/logout")
	ResponseEntity<Void> logout(@AuthenticationPrincipal Jwt jwt,
			@CookieValue(name = AuthCookies.REFRESH_TOKEN, required = false) @Nullable String token) {
		this.authService.logout(userId(jwt), token);
		return withCookies(ResponseEntity.status(HttpStatus.NO_CONTENT), this.cookies.clear()).build();
	}

	@GetMapping("/me")
	AuthService.Me me(@AuthenticationPrincipal Jwt jwt) {
		return this.authService.me(userId(jwt));
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	private static ResponseEntity.BodyBuilder withCookies(ResponseEntity.BodyBuilder builder,
			List<ResponseCookie> cookies) {
		cookies.forEach((cookie) -> builder.header(HttpHeaders.SET_COOKIE, cookie.toString()));
		return builder;
	}

	record UsernameAvailability(boolean available) {
	}

	record SignupRequest(@Nullable String username, @Nullable String displayName, @Nullable String password) {
	}

	record LoginRequest(@Nullable String username, @Nullable String password) {
	}

}
