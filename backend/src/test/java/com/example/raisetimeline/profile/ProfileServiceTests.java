package com.example.raisetimeline.profile;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.Follow;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.StorageDeleter;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserRepository;

import software.amazon.awssdk.core.exception.SdkClientException;

// プロフィールの表示と編集（FN-09）の処理を、データベースと S3 を使わずに確かめる
@ExtendWith(MockitoExtension.class)
class ProfileServiceTests {

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0 };

	private static final byte[] GIF = { 'G', 'I', 'F', '8', '9', 'a' };

	@Mock
	UserRepository users;

	@Mock
	FollowRepository follows;

	@Mock
	PostRepository posts;

	@Mock
	UserIcons icons;

	@Mock
	ImageStorage storage;

	@Mock
	StorageDeleter deleter;

	private ProfileService service;

	private final User taro = TestEntities.user(1, "taro_y");

	@BeforeEach
	void setUp() {
		this.service = new ProfileService(this.users, this.follows, this.posts, this.icons, this.storage, this.deleter,
				TestEntities.immediateTransaction(), TestEntities.fixedClock());
	}

	@Nested
	class 表示 {

		@Test
		void ほかの人のプロフィールは件数とフォローの状態を返す() {
			User hanako = TestEntities.user(2, "Hanako");
			when(ProfileServiceTests.this.users.findByUsername("hanako")).thenReturn(Optional.of(hanako));
			when(ProfileServiceTests.this.follows.existsById(new Follow.Key(1, 2))).thenReturn(true);
			when(ProfileServiceTests.this.follows.countByFollowerId(2)).thenReturn(3L);
			when(ProfileServiceTests.this.follows.countByFolloweeId(2)).thenReturn(4L);
			when(ProfileServiceTests.this.posts.countByAuthorId(2)).thenReturn(5L);
			when(ProfileServiceTests.this.icons.url(hanako)).thenReturn("https://s3/icons/h.png");

			Profile profile = ProfileServiceTests.this.service.read(1, "hanako");

			// ユーザー ID は登録したときの書き方で返す
			assertThat(profile).isEqualTo(new Profile("Hanako", "Hanakoの表示名", "", "https://s3/icons/h.png",
					TestEntities.NOW, 3, 4, 5, true, false));
		}

		@Test
		void 自分のプロフィールはmeでフォローの状態は調べない() {
			when(ProfileServiceTests.this.users.findByUsername("taro_y"))
				.thenReturn(Optional.of(ProfileServiceTests.this.taro));

			Profile profile = ProfileServiceTests.this.service.read(1, "taro_y");

			assertThat(profile.me()).isTrue();
			assertThat(profile.followedByMe()).isFalse();
			verify(ProfileServiceTests.this.follows, never()).existsById(any());
		}

		@Test
		void いないユーザーはUSER_NOT_FOUND() {
			when(ProfileServiceTests.this.users.findByUsername("nobody")).thenReturn(Optional.empty());
			assertApiError(() -> ProfileServiceTests.this.service.read(1, "nobody"), ErrorCode.USER_NOT_FOUND);
		}

	}

	@Nested
	class 表示名と自己紹介の編集 {

		@Test
		void トリムして保存し途中の改行は残す() {
			when(ProfileServiceTests.this.users.findById(1L)).thenReturn(Optional.of(ProfileServiceTests.this.taro));

			Profile profile = ProfileServiceTests.this.service.edit(1, " たろう ", " 1 行目\r\n2 行目 ");

			assertThat(ProfileServiceTests.this.taro.getDisplayName()).isEqualTo("たろう");
			assertThat(ProfileServiceTests.this.taro.getBio()).isEqualTo("1 行目\n2 行目");
			assertThat(profile.bio()).isEqualTo("1 行目\n2 行目");
		}

		@Test
		void 自己紹介は空にでき160文字まで() {
			when(ProfileServiceTests.this.users.findById(1L)).thenReturn(Optional.of(ProfileServiceTests.this.taro));
			ProfileServiceTests.this.service.edit(1, "たろう", null);
			assertThat(ProfileServiceTests.this.taro.getBio()).isEmpty();
			ProfileServiceTests.this.service.edit(1, "たろう", "あ".repeat(160));
			assertThat(ProfileServiceTests.this.taro.getBio()).hasSize(160);
		}

		@Test
		void 自己紹介が161文字ならBIO_TOO_LONGで変えない() {
			assertApiError(() -> ProfileServiceTests.this.service.edit(1, "たろう", "あ".repeat(161)),
					ErrorCode.BIO_TOO_LONG, "bio");
			verifyNoInteractions(ProfileServiceTests.this.users);
		}

		@Test
		void 表示名が空ならDISPLAY_NAME_REQUIRED() {
			assertApiError(() -> ProfileServiceTests.this.service.edit(1, " ", "よろしく"), ErrorCode.DISPLAY_NAME_REQUIRED,
					"displayName");
		}

		@Test
		void ユーザーが消されていればUNAUTHENTICATED() {
			when(ProfileServiceTests.this.users.findById(1L)).thenReturn(Optional.empty());
			assertApiError(() -> ProfileServiceTests.this.service.edit(1, "たろう", ""), ErrorCode.UNAUTHENTICATED);
		}

	}

	@Nested
	class アイコン {

		@Test
		void 新しいアイコンを置いてから差し替え前のアイコンを消す() {
			ProfileServiceTests.this.taro.changeIcon("icons/old.png", TestEntities.NOW);
			when(ProfileServiceTests.this.users.findByIdForUpdate(1L))
				.thenReturn(Optional.of(ProfileServiceTests.this.taro));
			when(ProfileServiceTests.this.users.findById(1L)).thenReturn(Optional.of(ProfileServiceTests.this.taro));

			ProfileServiceTests.this.service.changeIcon(1, icon(PNG));

			ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
			InOrder order = inOrder(ProfileServiceTests.this.storage, ProfileServiceTests.this.users,
					ProfileServiceTests.this.deleter);
			order.verify(ProfileServiceTests.this.storage).put(key.capture(), eq(ImageFormat.PNG), eq(PNG));
			order.verify(ProfileServiceTests.this.users).findByIdForUpdate(1L);
			order.verify(ProfileServiceTests.this.deleter).deleteOrRecord(List.of("icons/old.png"));
			assertThat(key.getValue()).startsWith("icons/").endsWith(".png");
			assertThat(ProfileServiceTests.this.taro.getIconKey()).isEqualTo(key.getValue());
		}

		@Test
		void 前のアイコンがなければ何も消さない() {
			when(ProfileServiceTests.this.users.findByIdForUpdate(1L))
				.thenReturn(Optional.of(ProfileServiceTests.this.taro));
			when(ProfileServiceTests.this.users.findById(1L)).thenReturn(Optional.of(ProfileServiceTests.this.taro));

			ProfileServiceTests.this.service.changeIcon(1, icon(PNG));

			verifyNoInteractions(ProfileServiceTests.this.deleter);
		}

		@Test
		void S3に置けなければICON_UPLOAD_FAILEDでアイコンは変えない() {
			doThrow(SdkClientException.create("S3 につながらない")).when(ProfileServiceTests.this.storage)
				.put(anyString(), any(), any());

			assertApiError(() -> ProfileServiceTests.this.service.changeIcon(1, icon(PNG)),
					ErrorCode.ICON_UPLOAD_FAILED);

			verifyNoInteractions(ProfileServiceTests.this.users, ProfileServiceTests.this.deleter);
		}

		@Test
		void データベースを変えられなければ置いた画像を消す() {
			when(ProfileServiceTests.this.users.findByIdForUpdate(1L))
				.thenThrow(new DataAccessResourceFailureException("DB が落ちている"));

			assertThatExceptionOfType(DataAccessResourceFailureException.class)
				.isThrownBy(() -> ProfileServiceTests.this.service.changeIcon(1, icon(PNG)));

			ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
			verify(ProfileServiceTests.this.storage).put(key.capture(), eq(ImageFormat.PNG), eq(PNG));
			verify(ProfileServiceTests.this.deleter).deleteOrRecord(List.of(key.getValue()));
		}

		@Test
		void GIFと画像でないファイルとファイルなしはICON_TYPE_INVALID() {
			assertApiError(() -> ProfileServiceTests.this.service.changeIcon(1, icon(GIF)), ErrorCode.ICON_TYPE_INVALID,
					"icon");
			assertApiError(() -> ProfileServiceTests.this.service.changeIcon(1, icon("<svg/>".getBytes())),
					ErrorCode.ICON_TYPE_INVALID, "icon");
			assertApiError(() -> ProfileServiceTests.this.service.changeIcon(1, null), ErrorCode.ICON_TYPE_INVALID,
					"icon");
			verifyNoInteractions(ProfileServiceTests.this.storage);
		}

		@Test
		void 五MBを超えるとICON_TOO_LARGE() {
			MultipartFile large = mock(MultipartFile.class);
			when(large.getSize()).thenReturn(ProfileService.ICON_BYTES_MAX + 1);
			assertApiError(() -> ProfileServiceTests.this.service.changeIcon(1, large), ErrorCode.ICON_TOO_LARGE,
					"icon");
			verifyNoInteractions(ProfileServiceTests.this.storage);
		}

		// N-8
		@Test
		void 外すとアイコンを空にしてから前のアイコンを消す() {
			ProfileServiceTests.this.taro.changeIcon("icons/old.png", TestEntities.NOW);
			when(ProfileServiceTests.this.users.findByIdForUpdate(1L))
				.thenReturn(Optional.of(ProfileServiceTests.this.taro));

			ProfileServiceTests.this.service.removeIcon(1);

			assertThat(ProfileServiceTests.this.taro.getIconKey()).isNull();
			verify(ProfileServiceTests.this.deleter).deleteOrRecord(List.of("icons/old.png"));
		}

		@Test
		void アイコンがないときに外しても何も消さない() {
			when(ProfileServiceTests.this.users.findByIdForUpdate(1L))
				.thenReturn(Optional.of(ProfileServiceTests.this.taro));
			ProfileServiceTests.this.service.removeIcon(1);
			verifyNoInteractions(ProfileServiceTests.this.deleter);
		}

	}

	private static MockMultipartFile icon(byte[] data) {
		return new MockMultipartFile("icon", "icon", "application/octet-stream", data);
	}

}
