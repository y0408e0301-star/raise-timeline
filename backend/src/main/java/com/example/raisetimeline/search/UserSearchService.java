package com.example.raisetimeline.search;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserSummary;

// ユーザー検索（機能定義書 FN-08）。ユーザー ID と表示名の部分一致で、大文字・小文字は区別しない（S-3・S-4）
@Service
class UserSearchService {

	static final int PAGE_SIZE = 20;

	// 深く読み進めて重い検索を続けられないよう、1,000 件より後は出さない（4 章）
	static final int MAX_RESULTS = 1000;

	// 検索語の上限（コードポイントで数える。S-5）
	static final int QUERY_MAX = 30;

	private final UserSearchRepository users;

	private final FollowRepository follows;

	private final UserIcons icons;

	UserSearchService(UserSearchRepository users, FollowRepository follows, UserIcons icons) {
		this.users = users;
		this.follows = follows;
		this.icons = icons;
	}

	// 21 件取って、21 件目があれば続きがある（データ設計書 8 章）。自分も結果に出る（S-8）
	@Transactional(readOnly = true)
	UserSearchResponse search(long viewerId, @Nullable String rawQuery, @Nullable String rawOffset) {
		String query = validQuery(rawQuery);
		int offset = validOffset(rawOffset);
		if (offset >= MAX_RESULTS) {
			return new UserSearchResponse(List.of(), null);
		}
		String escaped = escapeLike(query);
		List<User> found = this.users.search(query, escaped + "%", "%" + escaped + "%", PAGE_SIZE + 1, offset);
		List<User> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		int next = offset + PAGE_SIZE;
		Integer nextOffset = (found.size() > PAGE_SIZE && next < MAX_RESULTS) ? next : null;
		// 見ている人がフォローしているかは、20 件分を 1 回でまとめて取る
		Set<Long> followed = new HashSet<>(
				this.follows.findFolloweeIds(viewerId, page.stream().map(User::getId).toList()));
		List<UserSummary> items = page.stream()
			.map((user) -> UserSummary.of(user, viewerId, followed.contains(user.getId()), this.icons))
			.toList();
		return new UserSearchResponse(items, nextOffset);
	}

	// トリムして先頭の「@」を取り、1〜30 文字。比べるときは小文字にする（S-4・S-5）
	private static String validQuery(@Nullable String rawQuery) {
		String query = (rawQuery == null) ? "" : rawQuery.strip();
		if (query.startsWith("@")) {
			query = query.substring(1);
		}
		int length = query.codePointCount(0, query.length());
		if (length == 0 || length > QUERY_MAX) {
			throw new ApiException(ErrorCode.QUERY_INVALID, "q");
		}
		return query.toLowerCase(Locale.ROOT);
	}

	// 0 以上の 20 の倍数で、1,000 以下（4 章）。指定がなければ最初から
	private static int validOffset(@Nullable String rawOffset) {
		if (rawOffset == null) {
			return 0;
		}
		try {
			int offset = Integer.parseInt(rawOffset);
			if (offset >= 0 && offset <= MAX_RESULTS && offset % PAGE_SIZE == 0) {
				return offset;
			}
		}
		catch (NumberFormatException ex) {
			// 下で OFFSET_INVALID にする
		}
		throw new ApiException(ErrorCode.OFFSET_INVALID, "offset");
	}

	// 検索語の「%」「_」「\」は、LIKE の特別な記号ではなく文字として探す（5.2 No.1）
	static String escapeLike(String query) {
		return query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

}
