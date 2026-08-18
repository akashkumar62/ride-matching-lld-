package com.ridematching.common.dto;

import com.ridematching.common.enums.RideStatus;

import java.util.UUID;

public record RideDto(

        UUID rideId,

        UUID riderId,

        UUID driverId,

        LocationDto pickup,

        LocationDto destination,

        RideStatus status

) {
}