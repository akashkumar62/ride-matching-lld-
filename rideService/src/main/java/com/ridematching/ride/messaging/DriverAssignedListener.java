package com.ridematching.ride.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.DriverAssignedEvent;
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
public class DriverAssignedListener {

    private final RideRepository repository;
    private final RideService rideService;
    private final RideStreamRegistry rideStreamRegistry;

    @KafkaListener(topics = KafkaTopics.DRIVER_ASSIGNED, groupId = "ride-service-group")
    public void onDriverAssigned(DriverAssignedEvent event) {

        int updated = repository.acceptIfAvailable(event.rideId(), event.driverEmail());

        if (updated == 0) {
            log.info("Ignoring DriverAssignedEvent for ride {} — not in REQUESTED state (already assigned, cancelled, or redelivered)",
                    event.rideId());
        } else {
            log.info("Ride {} auto-assigned to driver {} via Kafka", event.rideId(), event.driverEmail());
            rideStreamRegistry.publish(event.rideId(), rideService.getById(event.rideId()));
        }
    }

}
