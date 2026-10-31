package com.example.raisetimeline.post;

import static com.example.raisetimeline.ApiAssertions.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
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
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.StorageDeleter;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;

import software.amazon.awssdk.core.exception.SdkClientException;

// 投稿・詳細・編集・削除（FN-03）と投稿の画像（FN-04）の処理を、データベースと S3 を使わずに確かめる
@ExtendWith(MockitoExtension.class)
class PostServiceTests {

	static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0 };

	static final byte[] JPEG = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0 };

	@Mock
	PostRepository posts;

	@Mock
	PostImageRepository images;

	@Mock
	UserRepository users;

	@Mock
	PostViews views;

	@Mock
	ImageStorage storage;

	@Mock
	StorageDeleter deleter;

	private PostService service;

	private final User taro = TestEntities.user(1, "taro_y");

	@BeforeEach
	void setUp() {
		this.service = new PostService(this.posts, this.images, this.users, this.views, this.storage, this.deleter,
				TestEntities.immediateTransaction(), TestEntities.fixedClock());
	}

	@Nested
	class 投稿 {

		@BeforeEach
		void setUp() {
			when(PostServiceTests.this.users.findById(1L)).thenReturn(Optional.of(PostServiceTests.this.taro));
		}

		@Test
		void 本文をそろえて保存し投稿を返す() {
			when(PostServiceTests.this.posts.save(any(Post.class)))
				.thenAnswer((invocation) -> TestEntities.withId(invocation.getArgument(0), 10L));

			PostServiceTests.this.service.create(1, " 今日は\r\n晴れ ", List.of());

			ArgumentCaptor<Post> saved = ArgumentCaptor.forClass(Post.class);
			verify(PostServiceTests.this.posts).save(saved.capture());
			assertThat(saved.getValue().getBody()).isEqualTo("今日は\n晴れ");
			assertThat(saved.getValue().getAuthor()).isSameAs(PostServiceTests.this.taro);
			assertThat(saved.getValue().getCreatedAt()).isEqualTo(TestEntities.NOW);
			verify(PostServiceTests.this.views).of(saved.getValue(), 1L);
			verifyNoInteractions(PostServiceTests.this.storage, PostServiceTests.this.images,
					PostServiceTests.this.deleter);
		}

		@Test
		void 画像はS3に置いてから選んだ順に保存する() {
			when(PostServiceTests.this.posts.save(any(Post.class)))
				.thenAnswer((invocation) -> TestEntities.withId(invocation.getArgument(0), 10L));

			PostServiceTests.this.service.create(1, "", List.of(file(PNG), file(JPEG)));

			ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
			verify(PostServiceTests.this.storage).put(keys.capture(), eq(ImageFormat.PNG), eq(PNG));
			verify(PostServiceTests.this.storage).put(keys.capture(), eq(ImageFormat.JPEG), eq(JPEG));
			assertThat(keys.getAllValues().get(0)).startsWith("posts/").endsWith(".png");
			assertThat(keys.getAllValues().get(1)).startsWith("posts/").endsWith(".jpg");

			ArgumentCaptor<PostImage> saved = ArgumentCaptor.forClass(PostImage.class);
			verify(PostServiceTests.this.images, times(2)).save(saved.capture());
			assertThat(saved.getAllValues())
				.extracting(PostImage::getPostId, PostImage::getStorageKey, PostImage::getContentType,
						PostImage::getByteSize, PostImage::getSortOrder)
				.containsExactly(tuple(10L, keys.getAllValues().get(0), "image/png", PNG.length, 0),
						tuple(10L, keys.getAllValues().get(1), "image/jpeg", JPEG.length, 1));
			verify(PostServiceTests.this.deleter, never()).deleteOrRecord(any());
		}

		// BR-4
		@Test
		void S3に置くのに失敗したらそれまでに置いた画像を消してIMAGE_UPLOAD_FAILED() {
			List<String> put = new ArrayList<>();
			doAnswer((invocation) -> put.add(invocation.getArgument(0))).when(PostServiceTests.this.storage)
				.put(any(), eq(ImageFormat.PNG), any());
			doThrow(SdkClientException.create("S3 につながらない")).when(PostServiceTests.this.storage)
				.put(any(), eq(ImageFormat.JPEG), any());

			assertApiError(() -> PostServiceTests.this.service.create(1, "", List.of(file(PNG), file(JPEG))),
					ErrorCode.IMAGE_UPLOAD_FAILED);

			verify(PostServiceTests.this.deleter).deleteOrRecord(put);
			assertThat(put).hasSize(1);
			verifyNoInteractions(PostServiceTests.this.posts, PostServiceTests.this.images);
		}

		// BR-4
		@Test
		void データベースへの保存に失敗したらS3に置いた画像を消す() {
			when(PostServiceTests.this.posts.save(any(Post.class)))
				.thenThrow(new DataAccessResourceFailureException("DB が落ちている"));

			assertThatExceptionOfType(DataAccessResourceFailureException.class)
				.isThrownBy(() -> PostServiceTests.this.service.create(1, "", List.of(file(PNG))));

			ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
			verify(PostServiceTests.this.storage).put(key.capture(), eq(ImageFormat.PNG), eq(PNG));
			verify(PostServiceTests.this.deleter).deleteOrRecord(List.of(key.getValue()));
		}

		@Test
		void ユーザーが消されていればS3に置かずにUNAUTHENTICATED() {
			when(PostServiceTests.this.users.findById(1L)).thenReturn(Optional.empty());
			assertApiError(() -> PostServiceTests.this.service.create(1, "本文", List.of(file(PNG))),
					ErrorCode.UNAUTHENTICATED);
			verifyNoInteractions(PostServiceTests.this.storage);
		}

	}

	@Nested
	class 投稿の入力の確かめ {

		// BR-2
		@Test
		void 画像がなく本文が空ならPOST_EMPTY() {
			assertApiError(() -> PostServiceTests.this.service.create(1, " \r\n ", List.of()), ErrorCode.POST_EMPTY,
					"body");
			assertApiError(() -> PostServiceTests.this.service.create(1, null, List.of()), ErrorCode.POST_EMPTY,
					"body");
		}

		@Test
		void 本文が281文字ならBODY_TOO_LONG() {
			assertApiError(() -> PostServiceTests.this.service.create(1, "あ".repeat(281), List.of()),
					ErrorCode.BODY_TOO_LONG, "body");
		}

		// BR-3
		@Test
		void 画像が5枚ならTOO_MANY_IMAGES() {
			List<MultipartFile> five = List.of(file(PNG), file(PNG), file(PNG), file(PNG), file(PNG));
			assertApiError(() -> PostServiceTests.this.service.create(1, "本文", five), ErrorCode.TOO_MANY_IMAGES,
					"images");
		}

		@Test
		void 五MBを超える画像はIMAGE_TOO_LARGE() {
			MultipartFile large = mock(MultipartFile.class);
			when(large.getSize()).thenReturn(PostService.IMAGE_BYTES_MAX + 1);
			assertApiError(() -> PostServiceTests.this.service.create(1, "本文", List.of(large)),
					ErrorCode.IMAGE_TOO_LARGE, "images");
		}

		@Test
		void 画像でないファイルはIMAGE_TYPE_INVALID() {
			MockMultipartFile svg = new MockMultipartFile("images", "a.png", "image/png", "<svg/>".getBytes());
			assertApiError(() -> PostServiceTests.this.service.create(1, "本文", List.of(svg)),
					ErrorCode.IMAGE_TYPE_INVALID, "images");
		}

		@Test
		void 枚数_大きさ_形式_本文の順に確かめる() {
			MockMultipartFile svg = new MockMultipartFile("images", "<svg/>".getBytes());
			List<MultipartFile> five = List.of(svg, svg, svg, svg, svg);
			assertApiError(() -> PostServiceTests.this.service.create(1, "あ".repeat(281), five),
					ErrorCode.TOO_MANY_IMAGES, "images");
			assertApiError(() -> PostServiceTests.this.service.create(1, "あ".repeat(281), List.of(svg)),
					ErrorCode.IMAGE_TYPE_INVALID, "images");
		}

		@Test
		void 入力が正しくなければデータベースもS3も使わない() {
			assertApiError(() -> PostServiceTests.this.service.create(1, "", List.of()), ErrorCode.POST_EMPTY, "body");
			verifyNoInteractions(PostServiceTests.this.users, PostServiceTests.this.posts,
					PostServiceTests.this.storage);
		}

	}

	@Nested
	class 詳細_編集_削除 {

		private Post post;

		@BeforeEach
		void setUp() {
			this.post = TestEntities.withId(new Post(PostServiceTests.this.taro, "前の本文", TestEntities.NOW), 10L);
		}

		@Test
		void ない投稿はPOST_NOT_FOUND() {
			when(PostServiceTests.this.posts.findWithAuthorById(anyLong())).thenReturn(Optional.empty());
			assertApiError(() -> PostServiceTests.this.service.get(1, 99), ErrorCode.POST_NOT_FOUND);
			assertApiError(() -> PostServiceTests.this.service.edit(1, 99, "本文"), ErrorCode.POST_NOT_FOUND);
			assertApiError(() -> PostServiceTests.this.service.delete(1, 99), ErrorCode.POST_NOT_FOUND);
		}

		@Test
		void 詳細はほかの人の投稿も見られる() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			PostServiceTests.this.service.get(2, 10);
			verify(PostServiceTests.this.views).of(this.post, 2L);
		}

		@Test
		void 自分の投稿の本文と編集日時を変える() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			PostServiceTests.this.service.edit(1, 10, " 新しい本文 ");
			assertThat(this.post.getBody()).isEqualTo("新しい本文");
			assertThat(this.post.getEditedAt()).isEqualTo(TestEntities.NOW);
			assertThat(this.post.getCreatedAt()).isEqualTo(TestEntities.NOW);
		}

		@Test
		void 画像があれば本文を空にできる() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			when(PostServiceTests.this.images.countByPostId(10L)).thenReturn(1L);
			PostServiceTests.this.service.edit(1, 10, "");
			assertThat(this.post.getBody()).isEmpty();
		}

		@Test
		void 画像がなければ本文を空にできない() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			assertApiError(() -> PostServiceTests.this.service.edit(1, 10, " "), ErrorCode.POST_EMPTY, "body");
			assertThat(this.post.getBody()).isEqualTo("前の本文");
		}

		@Test
		void ほかの人の投稿は編集も削除もできずFORBIDDEN() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			assertApiError(() -> PostServiceTests.this.service.edit(2, 10, "本文"), ErrorCode.FORBIDDEN);
			assertApiError(() -> PostServiceTests.this.service.delete(2, 10), ErrorCode.FORBIDDEN);
			verify(PostServiceTests.this.posts, never()).delete(any());
			verifyNoInteractions(PostServiceTests.this.deleter);
		}

		// N-8・BR-5
		@Test
		void 削除はデータベースから消した後でS3の画像を消す() {
			when(PostServiceTests.this.posts.findWithAuthorById(10L)).thenReturn(Optional.of(this.post));
			when(PostServiceTests.this.images.findByPostIdOrderBySortOrderAsc(10L))
				.thenReturn(List.of(new PostImage(10, "posts/a.png", "image/png", 10, 0),
						new PostImage(10, "posts/b.jpg", "image/jpeg", 10, 1)));

			PostServiceTests.this.service.delete(1, 10);

			InOrder order = inOrder(PostServiceTests.this.posts, PostServiceTests.this.deleter);
			order.verify(PostServiceTests.this.posts).delete(this.post);
			order.verify(PostServiceTests.this.deleter).deleteOrRecord(List.of("posts/a.png", "posts/b.jpg"));
		}

	}

	private static MockMultipartFile file(byte[] data) {
		return new MockMultipartFile("images", "image", "application/octet-stream", data);
	}

}
