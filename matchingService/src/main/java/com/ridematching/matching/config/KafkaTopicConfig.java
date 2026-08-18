package com.ridematching.matching.config;

import com.ridematching.common.constants.KafkaTopics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    NewTopic driverAssignedTopic() {
        return TopicBuilder.name(KafkaTopics.DRIVER_ASSIGNED)
                .partitions(3)
                .replicas(1)
                .build();
    }

}
