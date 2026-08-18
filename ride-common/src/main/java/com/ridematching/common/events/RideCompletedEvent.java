package com.ridematching.common.events;

import com.ridematching.common.dto.LocationDto;

import java.time.Instant;
import java.util.UUID;

public record RideCompletedEvent(

        UUID rideId,

        String riderEmail,

        String driverEmail,

        LocationDto pickup,

        LocationDto destination,

        Instant completedAt

) {
}
