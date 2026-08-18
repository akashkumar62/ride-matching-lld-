package com.ridematching.location.dto;

public record AllDriversLocationResponse(

        String driverEmail,

        Double latitude,

        Double longitude

) {
}
