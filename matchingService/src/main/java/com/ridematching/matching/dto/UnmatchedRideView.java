package com.ridematching.matching.dto;

import com.ridematching.common.dto.LocationDto;

import java.util.UUID;

public record UnmatchedRideView(

        UUID id,

        String riderEmail,

        LocationDto pickup

) {
}
