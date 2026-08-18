package com.ridematching.common.events;

import java.util.UUID;

public record FareCalculatedEvent(

        UUID rideId,

        String riderEmail,

        Double fare

) {
}
