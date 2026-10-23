package com.example.raisetimeline.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 投稿・コメントの本文の扱い（FN-03 5 章 No.1、FN-05 5 章 No.2）
class BodyTextTests {

	@Test
	void nullは空文字にする() {
		assertThat(BodyText.normalize(null)).isEmpty();
	}

	@Test
	void 改行はLFにそろえる() {
		assertThat(BodyText.normalize("a\r\nb")).isEqualTo("a\nb");
		assertThat(BodyText.normalize("a\rb")).isEqualTo("a\nb");
		assertThat(BodyText.normalize("a\nb")).isEqualTo("a\nb");
		assertThat(BodyText.normalize("a\r\n\r\nb")).isEqualTo("a\n\nb");
	}

	@Test
	void 前後の空白と改行を取り除き途中の空白は残す() {
		assertThat(BodyText.normalize(" \r\n 今日は　晴れ \n\t")).isEqualTo("今日は　晴れ");
	}

	@Test
	void 全角の空白も前後なら取り除く() {
		assertThat(BodyText.normalize("　本文　")).isEqualTo("本文");
	}

	@Test
	void 空白だけなら空文字になる() {
		assertThat(BodyText.normalize(" 　\r\n")).isEmpty();
	}

	@Test
	void 上限は280文字で281文字から長すぎる() {
		assertThat(BodyText.isTooLong("あ".repeat(280))).isFalse();
		assertThat(BodyText.isTooLong("あ".repeat(281))).isTrue();
	}

	@Test
	void 絵文字はUTF16の長さではなく1文字として数える() {
		// 「😀」は Java の String では 2 文字（サロゲートペア）
		String emoji = "😀".repeat(280);
		assertThat(emoji).hasSize(560);
		assertThat(BodyText.isTooLong(emoji)).isFalse();
		assertThat(BodyText.isTooLong(emoji + "a")).isTrue();
	}

	@Test
	void CRLFは正規化した後で数えるので改行1つが1文字になる() {
		// 279 文字＋改行 1 つ。CRLF のまま数えると 281 文字になってしまう
		String raw = "あ".repeat(140) + "\r\n" + "あ".repeat(139);
		assertThat(BodyText.isTooLong(BodyText.normalize(raw))).isFalse();
	}

}
