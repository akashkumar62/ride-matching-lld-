package com.ridematching.common.events;

import java.time.Instant;

/** Published when a driver transitions into ONLINE — lets matchingService rescan unmatched
 *  rides immediately instead of waiting for its own retry-scheduler tick. */
public record DriverAvailableEvent(

        String driverEmail,

        Instant availableAt

) {
}
