package com.ridematching.matching.scheduler;

import com.ridematching.matching.client.RideServiceClient;
import com.ridematching.matching.dto.UnmatchedRideView;
import com.ridematching.matching.service.MatchingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class RetryMatchingScheduler {

    private final RideServiceClient rideServiceClient;
    private final MatchingService matchingService;

    @Value("${matching.rescan.unmatched-older-than-seconds}")
    private long olderThanSeconds;

    @Scheduled(fixedDelayString = "${matching.rescan.interval-ms}")
    public void rescanUnmatchedRides() {

        List<UnmatchedRideView> unmatched;

        try {
            unmatched = rideServiceClient.getUnmatchedRides(olderThanSeconds);
        } catch (Exception e) {
            log.warn("Retry rescan skipped — could not reach rideService: {}", e.getMessage());
            return;
        }

        for (UnmatchedRideView ride : unmatched) {
            log.info("Retrying match for unmatched ride {}", ride.id());
            matchingService.attemptMatch(ride.id(), ride.riderEmail(), ride.pickup());
        }
    }

}
