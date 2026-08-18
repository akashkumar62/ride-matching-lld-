package com.ridematching.driver.scheduler;

import com.ridematching.common.enums.DriverStatus;
import com.ridematching.driver.client.LocationServiceClient;
import com.ridematching.driver.entity.DriverProfile;
import com.ridematching.driver.repository.DriverProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * A driver who stops pinging locationService (app crashed, lost connection, force-quit
 * without going offline) still reads ONLINE/BUSY here forever unless something notices.
 * Runs periodically and flips any driver whose locationService presence has lapsed back
 * to OFFLINE, closing that gap without needing Redis keyspace-notification infrastructure.
 *
 * A driver who just flipped to ONLINE/BUSY hasn't necessarily had a chance to ping their
 * location yet — checking presence immediately made status flap on/off within one poll
 * tick. Every status change gets a grace window (matching locationService's own presence
 * TTL) before this reconciler will act on it, so "just went online" isn't punished the
 * same as "actually gone quiet."
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DriverPresenceReconciler {

    private final DriverProfileRepository repository;
    private final LocationServiceClient locationServiceClient;

    @Value("${driver.presence.grace-period-seconds}")
    private long gracePeriodSeconds;

    private static final List<DriverStatus> RECONCILABLE_STATUSES = List.of(DriverStatus.ONLINE, DriverStatus.BUSY);

    @Scheduled(fixedDelayString = "${driver.presence.reconcile-interval-ms}")
    public void reconcile() {

        List<DriverProfile> candidates = repository.findByStatusIn(RECONCILABLE_STATUSES);
        LocalDateTime graceCutoff = LocalDateTime.now().minusSeconds(gracePeriodSeconds);

        for (DriverProfile profile : candidates) {

            LocalDateTime statusUpdatedAt = profile.getStatusUpdatedAt();

            if (statusUpdatedAt != null && statusUpdatedAt.isAfter(graceCutoff)) {
                continue; // recently changed status — still within the grace window, give them time to ping a location
            }

            if (!locationServiceClient.isPresent(profile.getEmail())) {

                profile.setStatus(DriverStatus.OFFLINE);
                profile.setStatusUpdatedAt(LocalDateTime.now());
                repository.save(profile);

                log.info("Driver {} presence lapsed — auto-flipped to OFFLINE", profile.getEmail());
            }
        }
    }

}
