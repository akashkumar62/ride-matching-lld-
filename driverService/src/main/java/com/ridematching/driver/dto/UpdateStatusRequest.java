package com.ridematching.driver.dto;

import com.ridematching.common.enums.DriverStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateStatusRequest(

        @NotNull
        DriverStatus status

) {
}
