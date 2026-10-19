package com.example.raisetimeline.post;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, Long> {

	// 投稿者も一緒に読む（PostView に表示名・ユーザー ID を入れるため）
	@Query("select p from Post p join fetch p.author where p.id = :id")
	Optional<Post> findWithAuthorById(@Param("id") long id);

	// 「すべて」タブ：cursor より古い投稿を新しい順に（FN-02 5.1）
	@Query("select p from Post p join fetch p.author where p.id < :cursor order by p.id desc")
	List<Post> findAllBefore(@Param("cursor") long cursor, Limit limit);

	// 「フォロー中」タブ：自分とフォローしている人の投稿を、cursor より古いものから新しい順に（FN-02 5.1）
	@Query("""
			select p from Post p join fetch p.author a
			where p.id < :cursor
			  and (a.id = :me or a.id in (select f.followeeId from Follow f where f.followerId = :me))
			order by p.id desc
			""")
	List<Post> findFollowingBefore(@Param("me") long me, @Param("cursor") long cursor, Limit limit);

}
