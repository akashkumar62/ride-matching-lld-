package com.ridematching.matching.dto;

public record NearbyDriverResponse(

        String driverEmail,

        Double latitude,

        Double longitude,

        Double distanceKm

) {
}
