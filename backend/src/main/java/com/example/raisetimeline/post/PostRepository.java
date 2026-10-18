package com.example.raisetimeline.post;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, Long> {

	// 投稿者も一緒に読む（PostView に表示名・ユーザー ID を入れるため）
	@Query("select p from Post p join fetch p.author where p.id = :id")
	Optional<Post> findWithAuthorById(@Param("id") long id);

}
