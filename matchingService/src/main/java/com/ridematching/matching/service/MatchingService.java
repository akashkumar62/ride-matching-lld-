package com.ridematching.matching.service;

import com.ridematching.common.constants.KafkaTopics;
import com.ridematching.common.dto.LocationDto;
import com.ridematching.common.events.DriverAssignedEvent;
import com.ridematching.matching.client.DriverServiceClient;
import com.ridematching.matching.client.LocationServiceClient;
import com.ridematching.matching.dto.NearbyDriverResponse;
import com.ridematching.matching.strategy.DriverMatchingStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MatchingService {

    private final LocationServiceClient locationServiceClient;
    private final DriverServiceClient driverServiceClient;
    private final DriverClaimService driverClaimService;
    private final DriverMatchingStrategy matchingStrategy;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${matching.nearby.radius-km}")
    private double radiusKm;

    @Value("${matching.nearby.limit}")
    private int limit;

    /** How many times to double the search radius before giving up on this attempt. 3 widenings from a 5km base reaches 40km. */
    private static final int MAX_WIDENINGS = 3;

    public boolean attemptMatch(UUID rideId, String riderEmail, LocationDto pickup) {

        double currentRadiusKm = radiusKm;
        int currentLimit = limit;

        for (int widening = 0; widening <= MAX_WIDENINGS; widening++) {

            // GEORADIUS/GEOSEARCH returns the nearest `limit` candidates by distance regardless of
            // their online/claim status — a fixed limit means a handful of closer-but-unavailable
            // drivers (e.g. several parked at the exact same busy pickup point) can silently crowd
            // every genuinely reachable driver out of the candidate list entirely. Widening the
            // *radius* alone doesn't fix that, since the same small limit still caps the result at
            // each level — so the limit has to widen right alongside the radius.
            List<NearbyDriverResponse> candidates = new ArrayList<>(
                    locationServiceClient.findNearby(pickup.latitude(), pickup.longitude(), currentRadiusKm, currentLimit));

            // One bulk status call for every candidate at this radius level, instead of one HTTP
            // round trip per candidate inside the loop below — see "batch the per-candidate check"
            // in the Dispatch Internals write-up. Didn't measure as the bottleneck at today's scale,
            // but turns an O(candidates) chain of network calls into O(1) per widening level.
            Set<String> onlineEmails = driverServiceClient.onlineEmailsAmong(
                    candidates.stream().map(NearbyDriverResponse::driverEmail).toList());

            while (!candidates.isEmpty()) {

                Optional<String> selected = matchingStrategy.selectDriver(candidates);

                if (selected.isEmpty()) {
                    break;
                }

                String driverEmail = selected.get();

                if (!onlineEmails.contains(driverEmail)) {

                    log.info("Skipping candidate {} for ride {} — driverService reports not ONLINE",
                            driverEmail, rideId);
                    candidates.removeIf(c -> c.driverEmail().equals(driverEmail));
                    continue;
                }

                if (driverClaimService.tryClaim(driverEmail, rideId)) {

                    kafkaTemplate.send(
                            KafkaTopics.DRIVER_ASSIGNED,
                            rideId.toString(),
                            new DriverAssignedEvent(rideId, riderEmail, driverEmail, Instant.now()));

                    log.info("Matched ride {} to driver {} within {}km", rideId, driverEmail, currentRadiusKm);
                    return true;
                }

                candidates.removeIf(c -> c.driverEmail().equals(driverEmail));
            }

            if (widening < MAX_WIDENINGS) {
                log.info("No available driver within {}km (limit {}) for ride {} — widening search radius and candidate limit",
                        currentRadiusKm, currentLimit, rideId);
                currentRadiusKm *= 2;
                currentLimit *= 2;
            }
        }

        log.info("No available driver found for ride {} even after widening search to {}km", rideId, currentRadiusKm);
        return false;
    }

}
