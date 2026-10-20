package com.example.raisetimeline.follow;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FollowRepository extends JpaRepository<Follow, Follow.Key> {

	// すでにあるときは何もしない。同時に押されても行は 1 つ（F-4、BR-6）
	@Modifying
	@Query(value = """
			INSERT INTO follows (follower_id, followee_id, created_at) VALUES (:followerId, :followeeId, :now)
			ON CONFLICT DO NOTHING
			""", nativeQuery = true)
	void insertIfAbsent(@Param("followerId") long followerId, @Param("followeeId") long followeeId,
			@Param("now") Instant now);

	// ないときは何もしない（BR-6）
	@Modifying
	@Query("delete from Follow f where f.followerId = :followerId and f.followeeId = :followeeId")
	void deleteByFollowerIdAndFolloweeId(@Param("followerId") long followerId, @Param("followeeId") long followeeId);

	// フォロー数（「フォロー中」タブで M-8 を出すか決める。FN-02 6 章）
	long countByFollowerId(long followerId);

	// フォロワー数（FN-07 5 章 No.4）
	long countByFolloweeId(long followeeId);

	// userIds のうち、followerId がフォローしている人（ユーザーの行のフォローボタンの状態。機能定義書 3.5 UserSummary）
	@Query("select f.followeeId from Follow f where f.followerId = :followerId and f.followeeId in :userIds")
	List<Long> findFolloweeIds(@Param("followerId") long followerId, @Param("userIds") Collection<Long> userIds);

	// userId がフォローしている人を、cursor（日時と相手の ID）より後ろから新しい順に。
	// 同じ日時なら相手の ID の大きい順（FN-07 5 章 No.3）
	@Query("""
			select new com.example.raisetimeline.follow.FollowedUser(u, f.createdAt)
			from Follow f join User u on u.id = f.followeeId
			where f.followerId = :userId
			  and (f.createdAt < :followedAt or (f.createdAt = :followedAt and f.followeeId < :before))
			order by f.createdAt desc, f.followeeId desc
			""")
	List<FollowedUser> findFollowingBefore(@Param("userId") long userId, @Param("followedAt") Instant followedAt,
			@Param("before") long before, Limit limit);

	// userId をフォローしている人を、同じ順番で
	@Query("""
			select new com.example.raisetimeline.follow.FollowedUser(u, f.createdAt)
			from Follow f join User u on u.id = f.followerId
			where f.followeeId = :userId
			  and (f.createdAt < :followedAt or (f.createdAt = :followedAt and f.followerId < :before))
			order by f.createdAt desc, f.followerId desc
			""")
	List<FollowedUser> findFollowersBefore(@Param("userId") long userId, @Param("followedAt") Instant followedAt,
			@Param("before") long before, Limit limit);

}
