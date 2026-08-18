package com.ridematching.common.events;

import com.ridematching.common.dto.LocationDto;

import java.time.Instant;
import java.util.UUID;

public record RideRequestedEvent(

        UUID rideId,

        String riderEmail,

        LocationDto pickup,

        LocationDto destination,

        Instant requestedAt

) {
}
