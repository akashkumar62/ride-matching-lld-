package com.ridematching.ride.dto;

import com.ridematching.common.dto.LocationDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CreateRideRequest(

        @NotNull
        @Valid
        LocationDto pickup,

        @NotNull
        @Valid
        LocationDto destination

) {
}
