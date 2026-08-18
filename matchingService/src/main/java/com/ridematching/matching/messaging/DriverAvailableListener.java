package com.ridematching.matching.messaging;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.events.DriverAvailableEvent;
import com.ridematching.matching.scheduler.RetryMatchingScheduler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Closes the retry-cadence gap documented in the Dispatch Internals write-up: previously
 * nothing told matchingService "a driver just became available" — it could only find out
 * on the next RetryMatchingScheduler tick, up to matching.rescan.interval-ms later. This
 * reuses the exact same rescan the scheduler already runs, just triggered immediately
 * instead of on a timer.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DriverAvailableListener {

    private final RetryMatchingScheduler retryMatchingScheduler;

    @KafkaListener(topics = KafkaTopics.DRIVER_AVAILABLE, groupId = "matching-group")
    public void onDriverAvailable(DriverAvailableEvent event) {

        log.info("Driver {} became available — rescanning unmatched rides immediately", event.driverEmail());
        retryMatchingScheduler.rescanUnmatchedRides();
    }

}
