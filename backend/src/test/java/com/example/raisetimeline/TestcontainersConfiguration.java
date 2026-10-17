package com.example.raisetimeline;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

// テスト用の PostgreSQL を Docker で起動し、接続先（spring.datasource.*）を自動で差し替える。
// 開発用の DB（compose.yaml）は使わないので、起動していなくてもテストできる（Docker は動かしておく）。
// テストクラスどうしで Spring のコンテキストを使い回すので、コンテナは 1 回だけ起動する
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		// 開発用・本番と同じ版（compose.yaml）
		return new PostgreSQLContainer("postgres:17");
	}

}
