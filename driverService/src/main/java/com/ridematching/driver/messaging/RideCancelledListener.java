package com.ridematching.driver.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.events.RideCancelledEvent;
import com.ridematching.driver.repository.DriverProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Closes the same "driver stuck BUSY forever" gap as RideCompletedListener, for the case where
 * the rider — not the driver — is the one who ends the ride early: driver.assigned flips a driver
 * to BUSY, but a rider cancelling a DRIVER_ASSIGNED ride previously never told driverService the
 * ride was over, so that driver stayed BUSY (and therefore unmatchable) indefinitely.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RideCancelledListener {

    private final DriverProfileRepository repository;

    @KafkaListener(topics = KafkaTopics.RIDE_CANCELLED, groupId = "driver-service-group")
    public void onRideCancelled(RideCancelledEvent event) {

        if (event.driverEmail() == null) {
            return;
        }

        repository.findByEmail(event.driverEmail()).ifPresentOrElse(
                profile -> {
                    profile.setStatus(DriverStatus.ONLINE);
                    profile.setStatusUpdatedAt(LocalDateTime.now());
                    repository.save(profile);
                    log.info("Driver {} marked ONLINE after rider cancelled ride {}",
                            event.driverEmail(), event.rideId());
                },
                () -> log.warn("Received RideCancelledEvent for unknown driver {}", event.driverEmail())
        );
    }

}
