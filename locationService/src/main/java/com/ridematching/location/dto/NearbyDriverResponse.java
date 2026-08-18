package com.ridematching.location.dto;

public record NearbyDriverResponse(

        String driverEmail,

        Double latitude,

        Double longitude,

        Double distanceKm

) {
}
