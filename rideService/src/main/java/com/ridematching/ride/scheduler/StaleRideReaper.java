package com.ridematching.ride.scheduler;

import com.ridematching.ride.repository.RideRepository;
import com.ridematching.ride.service.RideService;
import com.ridematching.ride.streaming.RideStreamRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Nothing previously capped how long a ride could stay REQUESTED — matchingService's
 * RetryMatchingScheduler would retry it every 15s forever. Under sustained load (or just
 * an abandoned/failed test run) that backlog grows without bound and every one of those
 * zombie rides keeps competing for the same limited driver supply on every retry tick,
 * starving genuinely fresh ride requests (including a ride re-queued by a driver
 * cancellation) of any driver at all. This gives every ride a bounded window to find a
 * driver before giving up, instead of retrying indefinitely.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StaleRideReaper {

    private final RideRepository repository;
    private final RideService rideService;
    private final RideStreamRegistry rideStreamRegistry;

    @Value("${matching.max-wait-seconds}")
    private long maxWaitSeconds;

    @Scheduled(fixedDelayString = "${matching.reaper-interval-ms}")
    public void reapStaleSearches() {

        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(maxWaitSeconds);

        // Read the affected IDs before the bulk UPDATE below — otherwise anyone with an open
        // SSE stream on a ride that's about to be auto-cancelled never finds out.
        List<UUID> staleIds = repository.findStaleSearchIds(cutoff);
        int cancelled = repository.cancelStaleSearches(cutoff);

        if (cancelled > 0) {
            log.info("Auto-cancelled {} ride(s) that couldn't find a driver within {}s", cancelled, maxWaitSeconds);
            staleIds.forEach(id -> rideStreamRegistry.publish(id, rideService.getById(id)));
        }
    }

}
