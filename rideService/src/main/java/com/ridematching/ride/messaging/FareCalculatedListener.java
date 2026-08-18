package com.ridematching.ride.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.FareCalculatedEvent;
import com.ridematching.ride.repository.RideRepository;
import com.ridematching.ride.service.RideService;
import com.ridematching.ride.streaming.RideStreamRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class FareCalculatedListener {

    private final RideRepository repository;
    private final RideService rideService;
    private final RideStreamRegistry rideStreamRegistry;

    @KafkaListener(topics = KafkaTopics.FARE_CALCULATED, groupId = "ride-service-group")
    public void onFareCalculated(FareCalculatedEvent event) {

        repository.applyFare(event.rideId(), event.fare());

        log.info("Applied fare {} to ride {}", event.fare(), event.rideId());
        rideStreamRegistry.publish(event.rideId(), rideService.getById(event.rideId()));
    }

}
