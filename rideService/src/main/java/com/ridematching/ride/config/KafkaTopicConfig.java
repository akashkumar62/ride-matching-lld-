package com.ridematching.ride.config;

import com.ridematching.common.constants.KafkaTopics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    NewTopic rideRequestedTopic() {
        return TopicBuilder.name(KafkaTopics.RIDE_REQUESTED)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    NewTopic rideCompletedTopic() {
        return TopicBuilder.name(KafkaTopics.RIDE_COMPLETED)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    NewTopic rideCancelledTopic() {
        return TopicBuilder.name(KafkaTopics.RIDE_CANCELLED)
                .partitions(3)
                .replicas(1)
                .build();
    }

}
