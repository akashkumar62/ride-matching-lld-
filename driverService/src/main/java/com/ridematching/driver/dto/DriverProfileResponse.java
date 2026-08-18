package com.ridematching.driver.dto;

import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.enums.VehicleType;

import java.util.UUID;

public record DriverProfileResponse(

        UUID id,

        String email,

        String fullName,

        String phone,

        VehicleType vehicleType,

        String vehicleNumber,

        DriverStatus status

) {
}
