package com.ridematching.ride.dto;

import com.ridematching.common.dto.LocationDto;
import com.ridematching.common.enums.RideStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public record RideResponse(

        UUID id,

        String riderEmail,

        String driverEmail,

        LocationDto pickup,

        LocationDto destination,

        RideStatus status,

        Double fare,

        LocalDateTime createdAt

) {
}
