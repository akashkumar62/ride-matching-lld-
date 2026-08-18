package com.ridematching.common.events;

import java.time.Instant;
import java.util.UUID;

public record DriverAssignedEvent(

        UUID rideId,

        String riderEmail,

        String driverEmail,

        Instant assignedAt

) {
}
