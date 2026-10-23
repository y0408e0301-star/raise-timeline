package com.example.raisetimeline.user;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

import com.example.raisetimeline.storage.ImageStorage;

// アイコン画像の URL（FN-09 5 章 No.7）。投稿の画像と同じく有効期限 15 分の署名付き URL を、返すたびに作る。
// URL は手元で計算するので、S3 とは通信しない
@Component
public class UserIcons {

	private final ImageStorage storage;

	UserIcons(ImageStorage storage) {
		this.storage = storage;
	}

	// アイコンを設定していなければ null（画面は頭文字の丸を出す。PF-10）
	public @Nullable String url(User user) {
		String key = user.getIconKey();
		return (key == null) ? null : this.storage.signedUrl(key).url();
	}

}
