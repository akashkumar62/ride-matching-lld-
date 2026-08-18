package com.ridematching.matching.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.RideRequestedEvent;
import com.ridematching.matching.service.MatchingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RideRequestedListener {

    private final MatchingService matchingService;

    @KafkaListener(topics = KafkaTopics.RIDE_REQUESTED, groupId = "matching-group")
    public void onRideRequested(RideRequestedEvent event) {

        try {
            matchingService.attemptMatch(event.rideId(), event.riderEmail(), event.pickup());
        } catch (Exception e) {
            log.warn("Failed to process RideRequestedEvent for ride {}: {} — will be picked up by the retry rescan",
                    event.rideId(), e.getMessage());
        }
    }

}
