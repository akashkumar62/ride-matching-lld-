package com.ridematching.driver.config;

import com.ridematching.common.constants.KafkaTopics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    NewTopic driverAvailableTopic() {
        return TopicBuilder.name(KafkaTopics.DRIVER_AVAILABLE)
                .partitions(3)
                .replicas(1)
                .build();
    }

}
