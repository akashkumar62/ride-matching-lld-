package com.ridematching.pricing.config;

import com.ridematching.common.constants.KafkaTopics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    NewTopic fareCalculatedTopic() {
        return TopicBuilder.name(KafkaTopics.FARE_CALCULATED)
                .partitions(3)
                .replicas(1)
                .build();
    }

}
