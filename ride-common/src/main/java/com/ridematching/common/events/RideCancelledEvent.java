package com.ridematching.common.events;

import java.time.Instant;
import java.util.UUID;

/** Published when a rider cancels a ride that already had a driver assigned — lets driverService
 *  free that driver the same way RideCompletedEvent does, instead of leaving them stuck BUSY. */
public record RideCancelledEvent(

        UUID rideId,

        String riderEmail,

        String driverEmail,

        Instant cancelledAt

) {
}
