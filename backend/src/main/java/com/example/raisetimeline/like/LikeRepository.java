package com.example.raisetimeline.like;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.raisetimeline.common.PostCount;

public interface LikeRepository extends JpaRepository<Like, Like.Key> {

	// すでにあるときは何もしない。同時に押されても行は 1 つ（L-3、BR-6）
	@Modifying
	@Query(value = "INSERT INTO likes (user_id, post_id, created_at) VALUES (:userId, :postId, :now) ON CONFLICT DO NOTHING",
			nativeQuery = true)
	void insertIfAbsent(@Param("userId") long userId, @Param("postId") long postId, @Param("now") Instant now);

	// ないときは何もしない（BR-6）
	@Modifying
	@Query("delete from Like l where l.userId = :userId and l.postId = :postId")
	void deleteByUserIdAndPostId(@Param("userId") long userId, @Param("postId") long postId);

	long countByPostId(long postId);

	// 一覧に出す投稿のいいね数を 1 回でまとめて数える（N+1 を作らない。FN-02 5.2）。0 件の投稿は結果に入らない
	@Query("""
			select new com.example.raisetimeline.common.PostCount(l.postId, count(l))
			from Like l where l.postId in :postIds group by l.postId
			""")
	List<PostCount> countByPostIds(@Param("postIds") Collection<Long> postIds);

	// postIds のうち、userId がいいねしている投稿（PostView の likedByMe）
	@Query("select l.postId from Like l where l.userId = :userId and l.postId in :postIds")
	List<Long> findLikedPostIds(@Param("userId") long userId, @Param("postIds") Collection<Long> postIds);

	// いいねした人を、cursor（日時と user_id）より後ろから新しい順に。同じ日時なら user_id の大きい順（FN-06 5 章 No.3）
	@Query("""
			select new com.example.raisetimeline.like.Liker(u, l.createdAt)
			from Like l join User u on u.id = l.userId
			where l.postId = :postId
			  and (l.createdAt < :likedAt or (l.createdAt = :likedAt and l.userId < :userId))
			order by l.createdAt desc, l.userId desc
			""")
	List<Liker> findLikersBefore(@Param("postId") long postId, @Param("likedAt") Instant likedAt,
			@Param("userId") long userId, Limit limit);

}
