package com.example.raisetimeline.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.example.raisetimeline.TestEntities;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.ImageStorage.SignedUrl;

// アイコン画像の URL（FN-09 5 章 No.7）と、ユーザーの行（機能定義書 3.5 UserSummary）
@ExtendWith(MockitoExtension.class)
class UserIconsTests {

	@Mock
	ImageStorage storage;

	@Test
	void アイコンがなければnullでS3の部品は使わない() {
		UserIcons icons = new UserIcons(this.storage);
		assertThat(icons.url(TestEntities.user(1, "taro_y"))).isNull();
		verifyNoInteractions(this.storage);
	}

	@Test
	void アイコンがあれば署名付きURLを返す() {
		User user = TestEntities.user(1, "taro_y");
		user.changeIcon("icons/a.png", TestEntities.NOW);
		when(this.storage.signedUrl("icons/a.png")).thenReturn(new SignedUrl("https://s3/icons/a.png", Instant.MAX));
		assertThat(new UserIcons(this.storage).url(user)).isEqualTo("https://s3/icons/a.png");
	}

	@Test
	void ユーザーの行には自己紹介の1行目だけを入れる() {
		User user = TestEntities.user(2, "hanako");
		user.editProfile("はなこ", "1 行目\n2 行目", TestEntities.NOW);
		UserSummary summary = UserSummary.of(user, 1, true, new UserIcons(this.storage));
		assertThat(summary).isEqualTo(new UserSummary("hanako", "はなこ", "1 行目", null, true, false));
	}

	@Test
	void 自己紹介が空なら1行目も空で見ている本人ならmeになる() {
		User user = TestEntities.user(1, "taro_y");
		UserSummary summary = UserSummary.of(user, 1, false, new UserIcons(this.storage));
		assertThat(summary.bioFirstLine()).isEmpty();
		assertThat(summary.me()).isTrue();
	}

}
