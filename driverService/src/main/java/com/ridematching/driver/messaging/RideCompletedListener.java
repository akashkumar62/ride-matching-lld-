package com.ridematching.driver.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.events.RideCompletedEvent;
import com.ridematching.driver.repository.DriverProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Closes the "driver stuck BUSY forever" gap: driver.assigned flips a driver to BUSY,
 * but nothing previously flipped them back once the ride actually finished — a driver
 * had to manually toggle their own status again after every single ride.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RideCompletedListener {

    private final DriverProfileRepository repository;

    @KafkaListener(topics = KafkaTopics.RIDE_COMPLETED, groupId = "driver-service-group")
    public void onRideCompleted(RideCompletedEvent event) {

        if (event.driverEmail() == null) {
            return;
        }

        repository.findByEmail(event.driverEmail()).ifPresentOrElse(
                profile -> {
                    profile.setStatus(DriverStatus.ONLINE);
                    profile.setStatusUpdatedAt(LocalDateTime.now());
                    repository.save(profile);
                    log.info("Driver {} marked ONLINE after completing ride {}",
                            event.driverEmail(), event.rideId());
                },
                () -> log.warn("Received RideCompletedEvent for unknown driver {}", event.driverEmail())
        );
    }

}
