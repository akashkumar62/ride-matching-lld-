package com.ridematching.location.dto;

public record DriverLocationResponse(

        String driverEmail,

        Double latitude,

        Double longitude

) {
}
