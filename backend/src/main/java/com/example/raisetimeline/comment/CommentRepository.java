package com.example.raisetimeline.comment;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.raisetimeline.common.PostCount;

public interface CommentRepository extends JpaRepository<Comment, Long> {

	// コメントした人も一緒に読む（表示名・ユーザー ID を出すため）
	@Query("select c from Comment c join fetch c.author where c.id = :id")
	Optional<Comment> findWithAuthorById(@Param("id") long id);

	// cursor より新しいコメントを古い順に（FN-05 5 章 No.1）
	@Query("select c from Comment c join fetch c.author where c.postId = :postId and c.id > :cursor order by c.id")
	List<Comment> findAfter(@Param("postId") long postId, @Param("cursor") long cursor, Limit limit);

	// 一覧に出す投稿のコメント数を 1 回でまとめて数える（N+1 を作らない。FN-02 5.2）。0 件の投稿は結果に入らない
	@Query("""
			select new com.example.raisetimeline.common.PostCount(c.postId, count(c))
			from Comment c where c.postId in :postIds group by c.postId
			""")
	List<PostCount> countByPostIds(@Param("postIds") Collection<Long> postIds);

}
