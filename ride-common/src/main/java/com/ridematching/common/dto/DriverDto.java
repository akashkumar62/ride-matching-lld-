package com.ridematching.common.dto;

import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.enums.VehicleType;

import java.util.UUID;

public record DriverDto(

        UUID id,

        String fullName,

        String phone,

        VehicleType vehicleType,

        DriverStatus status,

        LocationDto location

) {
}