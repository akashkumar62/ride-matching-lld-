package com.ridematching.driver.dto;

import com.ridematching.common.enums.VehicleType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpdateDriverProfileRequest(

        @NotBlank
        String fullName,

        String phone,

        @NotNull
        VehicleType vehicleType,

        @NotBlank
        String vehicleNumber

) {
}
