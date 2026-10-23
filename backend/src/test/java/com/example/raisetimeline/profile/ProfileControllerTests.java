package com.example.raisetimeline.profile;

import static com.example.raisetimeline.ControllerTestSupport.assertError;
import static com.example.raisetimeline.ControllerTestSupport.loggedIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

import com.example.raisetimeline.ControllerTest;
import com.example.raisetimeline.common.ErrorCode;

// プロフィールの API（FN-09 6 章）の入口。自分のものを変える API は URL にユーザー ID を入れない
@ControllerTest(ProfileController.class)
class ProfileControllerTests {

	private static final Profile PROFILE = new Profile("Hanako", "はなこ", "よろしく", null,
			Instant.parse("2026-10-01T00:00:00Z"), 3, 4, 5, true, false);

	@Autowired
	MockMvcTester mvc;

	@MockitoBean
	ProfileService profileService;

	@Test
	void プロフィールを決めた形で返す() {
		when(this.profileService.read(1, "hanako")).thenReturn(PROFILE);

		assertThat(this.mvc.get().uri("/api/users/hanako").with(loggedIn(1)).exchange()).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					{
					  "username": "Hanako", "displayName": "はなこ", "bio": "よろしく", "iconUrl": null,
					  "joinedAt": "2026-10-01T00:00:00Z", "followingCount": 3, "followerCount": 4, "postCount": 5,
					  "followedByMe": true, "me": false
					}
					""");
	}

	@Test
	void 編集はログインしている人のプロフィールを変える() {
		when(this.profileService.edit(2, "はなこ", "よろしく")).thenReturn(PROFILE);
		MvcTestResult result = this.mvc.patch()
			.uri("/api/me/profile")
			.with(csrf())
			.with(loggedIn(2))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"displayName\":\"はなこ\",\"bio\":\"よろしく\"}")
			.exchange();
		assertThat(result).hasStatusOk();
	}

	@Test
	void アイコンはmultipartのiconで受け取る() {
		when(this.profileService.changeIcon(eq(2L), any())).thenReturn(PROFILE);

		MvcTestResult result = this.mvc.put()
			.uri("/api/me/icon")
			.with(csrf())
			.with(loggedIn(2))
			.multipart()
			.file(new MockMultipartFile("icon", "me.png", "image/png", new byte[] { 1, 2 }))
			.exchange();

		assertThat(result).hasStatusOk();
		ArgumentCaptor<MultipartFile> icon = ArgumentCaptor.forClass(MultipartFile.class);
		verify(this.profileService).changeIcon(eq(2L), icon.capture());
		assertThat(icon.getValue().getOriginalFilename()).isEqualTo("me.png");
	}

	@Test
	void アイコンのファイルがなければnullを渡してサービスに確かめさせる() {
		when(this.profileService.changeIcon(eq(2L), isNull())).thenReturn(PROFILE);
		assertThat(this.mvc.put().uri("/api/me/icon").with(csrf()).with(loggedIn(2)).multipart().exchange())
			.hasStatusOk();
	}

	@Test
	void アイコンが大きすぎてmultipartで断られたら413のICON_TOO_LARGE() {
		when(this.profileService.changeIcon(eq(2L), any())).thenThrow(new MaxUploadSizeExceededException(5));
		MvcTestResult result = this.mvc.put()
			.uri("/api/me/icon")
			.with(csrf())
			.with(loggedIn(2))
			.multipart()
			.file(new MockMultipartFile("icon", new byte[] { 1 }))
			.exchange();
		assertError(result, ErrorCode.ICON_TOO_LARGE, "icon");
	}

	@Test
	void アイコンを外すと204() {
		assertThat(this.mvc.delete().uri("/api/me/icon").with(csrf()).with(loggedIn(2)).exchange())
			.hasStatus(HttpStatus.NO_CONTENT);
		verify(this.profileService).removeIcon(2);
	}

	@Test
	void ログインが要る() {
		assertError(this.mvc.get().uri("/api/users/hanako").exchange(), ErrorCode.UNAUTHENTICATED);
		assertError(this.mvc.delete().uri("/api/me/icon").with(csrf()).exchange(), ErrorCode.UNAUTHENTICATED);
		verifyNoInteractions(this.profileService);
	}

}
