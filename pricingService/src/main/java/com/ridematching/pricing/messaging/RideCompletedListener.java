package com.ridematching.pricing.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.FareCalculatedEvent;
import com.ridematching.common.events.RideCompletedEvent;
import com.ridematching.pricing.service.FareCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RideCompletedListener {

    private final FareCalculator fareCalculator;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @KafkaListener(topics = KafkaTopics.RIDE_COMPLETED, groupId = "pricing-group")
    public void onRideCompleted(RideCompletedEvent event) {

        double fare = fareCalculator.calculate(event.pickup(), event.destination());

        kafkaTemplate.send(
                KafkaTopics.FARE_CALCULATED,
                event.rideId().toString(),
                new FareCalculatedEvent(event.rideId(), event.riderEmail(), fare));

        log.info("Calculated fare {} for ride {}", fare, event.rideId());
    }

}
