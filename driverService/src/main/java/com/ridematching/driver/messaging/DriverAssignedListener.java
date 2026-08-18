package com.ridematching.driver.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.events.DriverAssignedEvent;
import com.ridematching.driver.repository.DriverProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class DriverAssignedListener {

    private final DriverProfileRepository repository;

    @KafkaListener(topics = KafkaTopics.DRIVER_ASSIGNED, groupId = "driver-service-group")
    public void onDriverAssigned(DriverAssignedEvent event) {

        repository.findByEmail(event.driverEmail()).ifPresentOrElse(
                profile -> {
                    profile.setStatus(DriverStatus.BUSY);
                    profile.setStatusUpdatedAt(LocalDateTime.now());
                    repository.save(profile);
                    log.info("Driver {} marked BUSY after assignment to ride {}",
                            event.driverEmail(), event.rideId());
                },
                () -> log.warn("Received DriverAssignedEvent for unknown driver {}", event.driverEmail())
        );
    }

}
