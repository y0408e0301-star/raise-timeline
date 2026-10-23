package com.example.raisetimeline.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

// 画像の形式はファイルの先頭のバイトで決める（FN-04 4 章）
class ImageFormatTests {

	@Test
	void JPEG() {
		assertThat(ImageFormat.detect(bytes(0xFF, 0xD8, 0xFF, 0xE0))).contains(ImageFormat.JPEG);
	}

	@Test
	void PNG() {
		assertThat(ImageFormat.detect(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0))).contains(ImageFormat.PNG);
	}

	@Test
	void GIFは87aも89aも() {
		assertThat(ImageFormat.detect(ascii("GIF87a"))).contains(ImageFormat.GIF);
		assertThat(ImageFormat.detect(ascii("GIF89a"))).contains(ImageFormat.GIF);
	}

	@Test
	void WebPは先頭のRIFFと9バイト目からのWEBP() {
		assertThat(ImageFormat.detect(ascii("RIFF\0\0\0\0WEBPVP8 "))).contains(ImageFormat.WEBP);
	}

	@Test
	void RIFFでもWEBPでなければ使えない() {
		// WAV の音声ファイル
		assertThat(ImageFormat.detect(ascii("RIFF\0\0\0\0WAVEfmt "))).isEmpty();
	}

	@Test
	void 先頭のバイトが足りなければ使えない() {
		assertThat(ImageFormat.detect(new byte[0])).isEmpty();
		assertThat(ImageFormat.detect(bytes(0xFF, 0xD8))).isEmpty();
		assertThat(ImageFormat.detect(ascii("RIFF\0\0\0\0WEB"))).isEmpty();
	}

	@Test
	void 画像でないファイルは使えない() {
		assertThat(ImageFormat.detect(ascii("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).isEmpty();
		assertThat(ImageFormat.detect(ascii("%PDF-1.7"))).isEmpty();
	}

	@Test
	void ContentTypeと拡張子() {
		assertThat(ImageFormat.JPEG.contentType()).isEqualTo("image/jpeg");
		assertThat(ImageFormat.JPEG.extension()).isEqualTo("jpg");
		assertThat(ImageFormat.WEBP.contentType()).isEqualTo("image/webp");
		assertThat(ImageFormat.WEBP.extension()).isEqualTo("webp");
	}

	private static byte[] bytes(int... values) {
		byte[] data = new byte[values.length];
		for (int i = 0; i < values.length; i++) {
			data[i] = (byte) values[i];
		}
		return data;
	}

	private static byte[] ascii(String text) {
		return text.getBytes(StandardCharsets.ISO_8859_1);
	}

}
