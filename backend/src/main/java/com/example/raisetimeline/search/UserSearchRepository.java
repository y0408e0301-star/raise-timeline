package com.example.raisetimeline.search;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.raisetimeline.user.User;

// ユーザー検索（データ設計書 8 章）。並び順は「ユーザー ID の完全一致 → ユーザー ID の前方一致 → 表示名の前方一致 → それ以外」、
// 同じ順位の中はフォロワーの多い順 → ユーザー ID の順（FN-08 S-6）。
// query は小文字にした検索語、prefix・contains は LIKE の記号をエスケープして「%」を付けたもの。
// ユーザー ID の順は、データベースの照合順序（記号を飛ばして比べることがある）によらず文字コードの順にする（COLLATE "C"）
interface UserSearchRepository extends JpaRepository<User, Long> {

	@Query(value = """
			SELECT u.* FROM users u
			WHERE lower(u.username) LIKE :contains ESCAPE '\\'
			   OR lower(u.display_name) LIKE :contains ESCAPE '\\'
			ORDER BY
			  CASE
			    WHEN lower(u.username) = :query THEN 1
			    WHEN lower(u.username) LIKE :prefix ESCAPE '\\' THEN 2
			    WHEN lower(u.display_name) LIKE :prefix ESCAPE '\\' THEN 3
			    ELSE 4
			  END,
			  (SELECT count(*) FROM follows f WHERE f.followee_id = u.id) DESC,
			  lower(u.username) COLLATE "C"
			LIMIT :limit OFFSET :offset
			""", nativeQuery = true)
	List<User> search(@Param("query") String query, @Param("prefix") String prefix, @Param("contains") String contains,
			@Param("limit") int limit, @Param("offset") int offset);

}
